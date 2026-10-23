import { NextRequest, NextResponse } from 'next/server';
import { ResolveTokenSchema } from '@/lib/marketplace/validation';
import { marketplaceClient } from '@/lib/marketplace/client';
import { getSubscriptionByMarketplaceId } from '@/lib/marketplace/subscriptions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = ResolveTokenSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { token } = parseResult.data;

    // Resolve the token with Microsoft SaaS Fulfillment API
    const resolvedData = await marketplaceClient.resolveSubscription(token);

    if (!resolvedData || !resolvedData.id) {
      return NextResponse.json(
        { error: 'Failed to resolve purchase token with Microsoft Marketplace' },
        { status: 400 }
      );
    }

    // Check if subscription was previously stored locally
    const existingSub = await getSubscriptionByMarketplaceId(resolvedData.id);

    return NextResponse.json({
      success: true,
      subscription: {
        id: resolvedData.id,
        subscriptionName: resolvedData.subscriptionName || resolvedData.subscription?.name,
        offerId: resolvedData.offerId || resolvedData.subscription?.offerId,
        planId: resolvedData.planId || resolvedData.subscription?.planId,
        quantity: resolvedData.quantity || 1,
        status: existingSub?.status || resolvedData.subscription?.saasSubscriptionStatus || 'PendingFulfillmentStart',
        beneficiary: resolvedData.subscription?.beneficiary,
        purchaser: resolvedData.subscription?.purchaser,
        term: resolvedData.subscription?.term,
        isClaimed: !!existingSub,
        claimedBy: existingSub?.user ? { email: existingSub.user.email, name: existingSub.user.name } : null,
      },
    });
  } catch (error: unknown) {
    console.error('API /api/marketplace/resolve error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
