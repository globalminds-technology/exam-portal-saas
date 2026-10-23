import { NextRequest, NextResponse } from 'next/server';
import { ActivateSubscriptionSchema } from '@/lib/marketplace/validation';
import { marketplaceClient } from '@/lib/marketplace/client';
import { linkAndActivateSubscription } from '@/lib/marketplace/subscriptions';
import { getSessionFromRequest, setSessionCookie } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db';
import { MarketplaceSubscriptionStatus } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = ActivateSubscriptionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { subscriptionId, planId, quantity, newAdmin } = parseResult.data;

    // 1. Authenticate user or create new organization admin
    let currentSession = await getSessionFromRequest(request);
    let targetUserId: string;

    if (currentSession) {
      targetUserId = currentSession.userId;
    } else if (newAdmin) {
      // Check if user already exists
      const existingUser = await db.user.findUnique({
        where: { email: newAdmin.email },
      });

      if (existingUser) {
        return NextResponse.json(
          {
            error:
              'An account with this email already exists. Please sign in first before activating your subscription.',
          },
          { status: 409 }
        );
      }

      // Provision new administrator account for Marketplace buyer
      const passwordHash = await hashPassword(newAdmin.password);
      const newUser = await db.user.create({
        data: {
          name: newAdmin.name,
          email: newAdmin.email,
          passwordHash,
          role: 'ADMIN',
          isActive: true,
        },
      });

      targetUserId = newUser.id;

      // Automatically sign in the new admin
      await setSessionCookie({
        userId: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      });
    } else {
      return NextResponse.json(
        {
          error: 'Authentication required. Please sign in or provide administrator registration details to activate.',
        },
        { status: 401 }
      );
    }

    // 2. Fetch live subscription details from Microsoft to verify existence & parameters
    const msSub = await marketplaceClient.getSubscription(subscriptionId);
    if (!msSub) {
      return NextResponse.json(
        { error: 'Subscription not found in Microsoft Marketplace' },
        { status: 404 }
      );
    }

    // 3. Invoke Microsoft's Activate API if subscription is in PendingFulfillmentStart
    if (msSub.saasSubscriptionStatus === 'PendingFulfillmentStart') {
      await marketplaceClient.activateSubscription(subscriptionId, {
        planId,
        quantity: quantity || msSub.quantity || 1,
      });
    }

    // 4. Persist and link subscription in local database
    const activatedSub = await linkAndActivateSubscription({
      subscriptionId,
      subscriptionName: msSub.name || 'Azure Marketplace Subscription',
      offerId: msSub.offerId,
      planId,
      quantity: quantity || msSub.quantity || 1,
      status: MarketplaceSubscriptionStatus.Subscribed,
      termUnit: msSub.term?.termUnit,
      startDate: msSub.term?.startDate ? new Date(msSub.term.startDate) : undefined,
      endDate: msSub.term?.endDate ? new Date(msSub.term.endDate) : undefined,
      beneficiaryTenantId: msSub.beneficiary?.tenantId,
      beneficiaryEmail: msSub.beneficiary?.email,
      purchaserTenantId: msSub.purchaser?.tenantId,
      purchaserEmail: msSub.purchaser?.email,
      purchaserObjectId: msSub.purchaser?.objectId,
      userId: targetUserId,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription successfully activated and linked to your organization account.',
      subscription: activatedSub,
    });
  } catch (error: unknown) {
    console.error('API /api/marketplace/activate error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
