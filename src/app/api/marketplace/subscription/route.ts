import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getUserSubscriptions, getSubscriptionByMarketplaceId } from '@/lib/marketplace/subscriptions';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');

    // If specific subscription ID requested, verify ownership
    if (subscriptionId) {
      const subscription = await getSubscriptionByMarketplaceId(subscriptionId);

      if (!subscription) {
        return NextResponse.json(
          { error: 'Subscription not found' },
          { status: 404 }
        );
      }

      // Check ownership
      if (subscription.userId !== session.userId && session.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: 'Forbidden: You do not have access to this subscription' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        subscription,
      });
    }

    // Otherwise, return all subscriptions linked to current user
    const subscriptions = await getUserSubscriptions(session.userId);

    return NextResponse.json({
      success: true,
      subscriptions,
    });
  } catch (error: unknown) {
    console.error('API /api/marketplace/subscription error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
