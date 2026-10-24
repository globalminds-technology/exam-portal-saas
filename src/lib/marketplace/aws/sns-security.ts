/**
 * Amazon SNS Message Signature Verification
 * Ensures incoming HTTP POST requests to the SNS webhook were authentically dispatched by AWS.
 * Reference: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */

import crypto from 'crypto';
import type { AwsSnsMessageEnvelope } from './types';

// Regular expression to strictly validate Amazon SNS SigningCertURL domain
const SNS_CERT_URL_REGEX = /^https:\/\/sns\.[a-z0-9\-]+\.amazonaws\.com(\.cn)?\/SimpleNotificationService-[a-z0-9]+\.pem$/i;

// In-memory cache for downloaded AWS X.509 certificates to avoid fetching on every webhook
const certCache = new Map<string, { cert: string; expiresAt: number }>();

async function getSnsCertificate(certUrl: string): Promise<string> {
  if (!SNS_CERT_URL_REGEX.test(certUrl)) {
    throw new Error(`Invalid SNS SigningCertURL domain: ${certUrl}`);
  }

  const cached = certCache.get(certUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cert;
  }

  const response = await fetch(certUrl, {
    method: 'GET',
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SNS signing certificate from ${certUrl}`);
  }

  const cert = await response.text();
  // Cache certificate for 1 hour
  certCache.set(certUrl, {
    cert,
    expiresAt: Date.now() + 3600 * 1000,
  });

  return cert;
}

function buildCanonicalStringToSign(envelope: AwsSnsMessageEnvelope): string {
  let stringToSign = '';

  if (envelope.Type === 'Notification') {
    stringToSign += `Message\n${envelope.Message}\n`;
    stringToSign += `MessageId\n${envelope.MessageId}\n`;
    if (envelope.Subject) {
      stringToSign += `Subject\n${envelope.Subject}\n`;
    }
    stringToSign += `Timestamp\n${envelope.Timestamp}\n`;
    stringToSign += `TopicArn\n${envelope.TopicArn}\n`;
    stringToSign += `Type\n${envelope.Type}\n`;
  } else if (
    envelope.Type === 'SubscriptionConfirmation' ||
    envelope.Type === 'UnsubscribeConfirmation'
  ) {
    stringToSign += `Message\n${envelope.Message}\n`;
    stringToSign += `MessageId\n${envelope.MessageId}\n`;
    if (envelope.SubscribeURL) {
      stringToSign += `SubscribeURL\n${envelope.SubscribeURL}\n`;
    }
    stringToSign += `Timestamp\n${envelope.Timestamp}\n`;
    if (envelope.Token) {
      stringToSign += `Token\n${envelope.Token}\n`;
    }
    stringToSign += `TopicArn\n${envelope.TopicArn}\n`;
    stringToSign += `Type\n${envelope.Type}\n`;
  }

  return stringToSign;
}

export async function verifySnsSignature(envelope: AwsSnsMessageEnvelope): Promise<{
  isValid: boolean;
  error?: string;
}> {
  try {
    if (!envelope.SigningCertURL || !envelope.Signature || !envelope.SignatureVersion) {
      return { isValid: false, error: 'Missing SNS signature fields' };
    }

    const cert = await getSnsCertificate(envelope.SigningCertURL);
    const stringToSign = buildCanonicalStringToSign(envelope);

    let algorithm = 'RSA-SHA1';
    if (envelope.SignatureVersion === '2') {
      algorithm = 'RSA-SHA256';
    }

    const verifier = crypto.createVerify(algorithm);
    verifier.update(stringToSign, 'utf8');

    const isValid = verifier.verify(cert, envelope.Signature, 'base64');
    if (!isValid) {
      return { isValid: false, error: 'SNS signature verification failed' };
    }

    return { isValid: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown signature verification error';
    return { isValid: false, error: message };
  }
}
