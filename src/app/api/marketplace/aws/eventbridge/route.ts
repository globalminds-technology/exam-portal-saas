import { NextRequest, NextResponse } from 'next/server';
import { AwsEventBridgeEnvelopeSchema } from '@/lib/marketplace/aws/validation';
import {
  validateEventBridgeSecret,
  processEventBridgeEvent,
} from '@/lib/marketplace/aws/eventbridge';
import type { AwsEventBridgeEnvelope, AwsMarketplaceAgreementDetail } from '@/lib/marketplace/aws/types';

/**
 * Amazon EventBridge API Destination Ingestion Endpoint
 * Receives lifecycle events from event bus rule matching 'aws.agreement-marketplace'
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify webhook shared secret or bearer token
    const authHeader =
      request.headers.get('authorization') || request.headers.get('x-aws-eventbridge-secret');

    if (!validateEventBridgeSecret(authHeader)) {
      console.warn('Unauthorized EventBridge webhook request: Invalid secret token');
      return NextResponse.json({ error: 'Unauthorized: Invalid event secret' }, { status: 401 });
    }

    // 2. Parse payload JSON
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // EventBridge API Destinations may send a single event or a batch array of events
    const rawEvents = Array.isArray(body) ? body : [body];
    const results = [];

    for (const rawEvent of rawEvents) {
      const parseResult = AwsEventBridgeEnvelopeSchema.safeParse(rawEvent);
      if (!parseResult.success) {
        console.warn('Invalid EventBridge envelope schema:', parseResult.error.flatten());
        return NextResponse.json(
          {
            error: 'Invalid EventBridge envelope schema',
            details: parseResult.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const envelope = parseResult.data as AwsEventBridgeEnvelope<AwsMarketplaceAgreementDetail>;
      const result = await processEventBridgeEvent(envelope);
      results.push(result);
    }

    return NextResponse.json(
      {
        received: true,
        count: results.length,
        results,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('API /api/marketplace/aws/eventbridge error:', error);
    const message = error instanceof Error ? error.message : 'Internal EventBridge processing error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
