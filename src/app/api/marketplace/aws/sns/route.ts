import { NextRequest, NextResponse } from 'next/server';
import { AwsSnsEnvelopeSchema } from '@/lib/marketplace/aws/validation';
import { verifySnsSignature } from '@/lib/marketplace/aws/sns-security';
import { processAwsSnsNotification } from '@/lib/marketplace/aws/subscriptions';
import type { AwsSnsNotificationPayload, AwsSnsMessageEnvelope } from '@/lib/marketplace/aws/types';

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body as text because AWS SNS sends Content-Type: text/plain
    const rawBody = await request.text();
    let jsonBody: unknown;

    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // 2. Validate SNS envelope format
    const parseResult = AwsSnsEnvelopeSchema.safeParse(jsonBody);
    if (!parseResult.success) {
      console.warn('Invalid SNS envelope schema:', parseResult.error.flatten());
      return NextResponse.json(
        { error: 'Invalid SNS envelope structure', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const envelope = parseResult.data as AwsSnsMessageEnvelope;

    // Optional topic verification if AWS_MARKETPLACE_SNS_TOPIC_ARN is configured
    const configuredTopicArn = process.env.AWS_MARKETPLACE_SNS_TOPIC_ARN;
    if (configuredTopicArn && envelope.TopicArn !== configuredTopicArn) {
      console.warn(`Untrusted SNS TopicArn: ${envelope.TopicArn}`);
      return NextResponse.json({ error: 'Untrusted SNS Topic' }, { status: 403 });
    }

    // 3. Cryptographically verify SNS message signature
    const signatureCheck = await verifySnsSignature(envelope);
    if (!signatureCheck.isValid) {
      console.warn('Unauthorized SNS request: Signature verification failed:', signatureCheck.error);
      return NextResponse.json(
        { error: 'Forbidden: Invalid AWS SNS message signature', reason: signatureCheck.error },
        { status: 403 }
      );
    }

    // 4. Handle Subscription Confirmation Challenge
    if (envelope.Type === 'SubscriptionConfirmation' && envelope.SubscribeURL) {
      console.log('Received AWS SNS SubscriptionConfirmation. Visiting SubscribeURL to confirm...');
      const confirmResponse = await fetch(envelope.SubscribeURL, { method: 'GET' });

      if (confirmResponse.ok) {
        console.log('Successfully confirmed AWS SNS subscription.');
        return NextResponse.json({ confirmed: true, message: 'Subscription confirmed' }, { status: 200 });
      } else {
        console.error('Failed to confirm SNS subscription:', confirmResponse.status);
        return NextResponse.json({ error: 'Failed to confirm SNS subscription' }, { status: 500 });
      }
    }

    // 5. Handle Lifecycle Notifications
    if (envelope.Type === 'Notification') {
      let notificationPayload: AwsSnsNotificationPayload;
      try {
        notificationPayload = JSON.parse(envelope.Message) as AwsSnsNotificationPayload;
      } catch {
        return NextResponse.json({ error: 'Invalid notification message body JSON' }, { status: 400 });
      }

      const result = await processAwsSnsNotification(notificationPayload, envelope.MessageId);

      return NextResponse.json(
        {
          received: true,
          messageId: envelope.MessageId,
          action: notificationPayload.action,
          result,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('AWS Marketplace SNS webhook error:', error);
    const message = error instanceof Error ? error.message : 'Internal webhook error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
