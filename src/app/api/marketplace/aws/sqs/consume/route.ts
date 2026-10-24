import { NextRequest, NextResponse } from 'next/server';
import { awsMarketplaceClient } from '@/lib/marketplace/aws/client';
import { AwsEventBridgeEnvelopeSchema } from '@/lib/marketplace/aws/validation';
import { processEventBridgeEvent } from '@/lib/marketplace/aws/eventbridge';
import type { AwsEventBridgeEnvelope, AwsMarketplaceAgreementDetail } from '@/lib/marketplace/aws/types';

/**
 * Amazon SQS Consumer Endpoint for EventBridge Buffering
 * Allows draining messages from an SQS queue connected to EventBridge rule
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify authorization secret
    const authHeader =
      request.headers.get('authorization') || request.headers.get('x-consumer-secret');
    const expectedSecret =
      process.env.AWS_SQS_CONSUMER_SECRET || process.env.AWS_EVENTBRIDGE_WEBHOOK_SECRET;

    if (expectedSecret) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (token !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const queueUrl = process.env.AWS_MARKETPLACE_SQS_QUEUE_URL;
    if (!queueUrl) {
      return NextResponse.json(
        { error: 'AWS_MARKETPLACE_SQS_QUEUE_URL is not configured' },
        { status: 400 }
      );
    }

    // 2. Poll messages from SQS
    const sqsResponse = await awsMarketplaceClient.receiveSqsMessages(queueUrl, 10);
    const messages = sqsResponse.Messages || [];

    if (messages.length === 0) {
      return NextResponse.json({ processed: 0, message: 'Queue is empty' }, { status: 200 });
    }

    const results = [];

    // 3. Process each message
    for (const msg of messages) {
      if (!msg.Body || !msg.ReceiptHandle) continue;

      try {
        const parsedBody = JSON.parse(msg.Body);
        const parseResult = AwsEventBridgeEnvelopeSchema.safeParse(parsedBody);

        if (parseResult.success) {
          const envelope = parseResult.data as AwsEventBridgeEnvelope<AwsMarketplaceAgreementDetail>;
          const processResult = await processEventBridgeEvent(envelope);
          results.push(processResult);

          // Delete successfully processed message from SQS
          await awsMarketplaceClient.deleteSqsMessage(queueUrl, msg.ReceiptHandle);
        } else {
          console.warn('Invalid envelope structure in SQS message:', msg.MessageId);
        }
      } catch (err) {
        console.error(`Error processing SQS message ${msg.MessageId}:`, err);
      }
    }

    return NextResponse.json(
      {
        processed: results.length,
        results,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('API /api/marketplace/aws/sqs/consume error:', error);
    const message = error instanceof Error ? error.message : 'Internal SQS consumer error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
