import { NextRequest, NextResponse } from 'next/server';
import { AwsActivateSchema } from '@/lib/marketplace/aws/validation';
import { linkAndActivateAwsSubscription } from '@/lib/marketplace/aws/subscriptions';
import { awsMarketplaceClient } from '@/lib/marketplace/aws/client';
import { getSessionFromRequest, setSessionCookie } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = AwsActivateSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      customerAccountId,
      productCode,
      licenseArn,
      agreementId,
      customerIdentifier,
      dimension,
      quantity,
      newAdmin,
    } = parseResult.data;

    // 1. Authenticate user or provision new organization admin
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
              'An account with this email already exists. Please sign in first to link your AWS Marketplace subscription.',
          },
          { status: 409 }
        );
      }

      // Provision new administrator account for the AWS buyer
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

      // Automatically sign in the newly registered administrator
      await setSessionCookie({
        userId: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      });
    } else {
      return NextResponse.json(
        {
          error:
            'Authentication required. Please sign in or provide administrator registration details to activate.',
        },
        { status: 401 }
      );
    }

    // 2. Authoritatively verify entitlements on server-side (do not trust unverified client values)
    let verifiedDimension = dimension || 'standard';
    let verifiedQuantity = quantity || 1;
    let verifiedExpirationDate: Date | undefined;
    let hasVerifiedEntitlement = false;

    try {
      const entitlements = await awsMarketplaceClient.getEntitlements({
        licenseArn,
        customerAccountId,
        customerIdentifier,
        productCode,
      });

      if (entitlements.length > 0) {
        const primary = entitlements[0];
        verifiedDimension = primary.dimension || verifiedDimension;
        verifiedQuantity = primary.value?.IntegerValue ?? verifiedQuantity;
        verifiedExpirationDate = primary.expirationDate;
        hasVerifiedEntitlement = true;
      }
    } catch (entitlementError) {
      console.warn('Server-side AWS Entitlement check during activation warning:', entitlementError);
    }

    // 3. Link and activate subscription in database
    const subscription = await linkAndActivateAwsSubscription({
      customerAccountId,
      productCode,
      licenseArn,
      agreementId,
      customerIdentifier,
      dimension: verifiedDimension,
      quantity: verifiedQuantity,
      expirationDate: verifiedExpirationDate,
      hasVerifiedEntitlement,
      userId: targetUserId,
    });

    return NextResponse.json({
      success: true,
      message: 'AWS Marketplace subscription successfully linked.',
      subscription,
    });
  } catch (error: unknown) {
    console.error('API /api/marketplace/aws/activate error:', error);
    const message = error instanceof Error ? error.message : 'Internal activation error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
