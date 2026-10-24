import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import {
  getUserAwsSubscriptions,
  getAwsSubscriptionByCustomerIdentifier,
} from '@/lib/marketplace/aws/subscriptions';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerIdentifier = searchParams.get('customerIdentifier');

    if (customerIdentifier) {
      const subscription = await getAwsSubscriptionByCustomerIdentifier(customerIdentifier);
      if (!subscription) {
        return NextResponse.json({ error: 'AWS Subscription not found' }, { status: 404 });
      }

      if (subscription.userId !== session.userId && session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      return NextResponse.json({ success: true, subscription });
    }

    const subscriptions = await getUserAwsSubscriptions(session.userId);
    return NextResponse.json({ success: true, subscriptions });
  } catch (error: unknown) {
    console.error('API /api/marketplace/aws/subscription error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
