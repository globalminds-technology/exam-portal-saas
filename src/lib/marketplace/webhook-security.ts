/**
 * Webhook JWT Signature & Claims Validation for Microsoft Azure Marketplace
 * Reference: https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-webhook
 */

import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

// Microsoft's published OpenID public keys discovery endpoint
const MICROSOFT_JWKS_URL = 'https://login.microsoftonline.com/common/discovery/keys';
const jwks = createRemoteJWKSet(new URL(MICROSOFT_JWKS_URL));

export interface WebhookTokenValidationResult {
  isValid: boolean;
  claims?: JWTPayload;
  error?: string;
}

/**
 * Validates the Authorization Bearer JWT provided with incoming Microsoft Marketplace Webhooks.
 *
 * Verifications performed:
 * 1. Cryptographic signature verified against Microsoft's public JWKS.
 * 2. Token expiration (exp) and active period (nbf).
 * 3. Audience (aud) matches the configured MARKETPLACE_CLIENT_ID.
 * 4. Issuer (iss) originates from Microsoft identity platform.
 */
export async function validateMarketplaceWebhookToken(
  authHeader: string | null
): Promise<WebhookTokenValidationResult> {
  if (!authHeader) {
    return { isValid: false, error: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { isValid: false, error: 'Authorization header must use Bearer scheme' };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { isValid: false, error: 'Bearer token is empty' };
  }

  const clientId = process.env.MARKETPLACE_CLIENT_ID;
  if (!clientId) {
    console.error('MARKETPLACE_CLIENT_ID is not configured in environment variables.');
    return { isValid: false, error: 'Server authentication configuration missing' };
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      // Validate audience matches our registered client ID or app ID URI
      audience: clientId,
    });

    // Verify issuer is from Microsoft Entra (STS or login.microsoftonline.com)
    const iss = payload.iss;
    const isMicrosoftIssuer =
      typeof iss === 'string' &&
      (iss.startsWith('https://login.microsoftonline.com/') ||
        iss.startsWith('https://sts.windows.net/'));

    if (!isMicrosoftIssuer) {
      return {
        isValid: false,
        error: `Untrusted token issuer: ${iss}`,
      };
    }

    return {
      isValid: true,
      claims: payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown validation error';
    console.error('Marketplace webhook token validation failed:', message);
    return {
      isValid: false,
      error: `Token verification failed: ${message}`,
    };
  }
}
