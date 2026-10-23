import { NextRequest, NextResponse } from 'next/server';
import { validateMarketplaceWebhookToken } from '@/lib/marketplace/webhook-security';
import { MarketplaceWebhookSchema } from '@/lib/marketplace/validation';
import { processWebhookEvent } from '@/lib/marketplace/subscriptions';

export async function POST(request: NextRequest) {
  try {
    // 1. Validate Microsoft JWT signature and claims
    const authHeader = request.headers.get('authorization');
    const authResult = await validateMarketplaceWebhookToken(authHeader);

    if (!authResult.isValid) {
      console.warn('Unauthorized webhook request:', authResult.error);
      return NextResponse.json(
        { error: 'Unauthorized: Invalid Microsoft authentication token', reason: authResult.error },
        { status: 401 }
      );
    }

    // 2. Parse and validate webhook payload
    const body = await request.json();
    const parseResult = MarketplaceWebhookSchema.safeParse(body);

    if (!parseResult.success) {
      console.warn('Invalid webhook payload schema:', parseResult.error.flatten());
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const payload = parseResult.data;

    // 3. Process the event idempotently
    const result = await processWebhookEvent(payload);

    return NextResponse.json(
      {
        received: true,
        operationId: payload.id,
        action: payload.action,
        result,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Marketplace webhook error:', error);
    const message = error instanceof Error ? error.message : 'Internal webhook processing error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
