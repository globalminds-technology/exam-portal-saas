import { NextRequest, NextResponse } from 'next/server';
import { AwsLandingTokenSchema } from '@/lib/marketplace/aws/validation';
import { awsMarketplaceClient } from '@/lib/marketplace/aws/client';
import { getAwsSubscriptionByCustomerIdentifier } from '@/lib/marketplace/aws/subscriptions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = AwsLandingTokenSchema.safeParse(body);

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

    // Resolve token with AWS Marketplace Metering Service
    const resolvedData = await awsMarketplaceClient.resolveCustomer(token);

    if (!resolvedData || !resolvedData.customerIdentifier) {
      return NextResponse.json(
        { error: 'Failed to resolve registration token with AWS Marketplace' },
        { status: 400 }
      );
    }

    // Verify product code matches configured product code if set
    const expectedProductCode = process.env.AWS_MARKETPLACE_PRODUCT_CODE;
    if (expectedProductCode && resolvedData.productCode !== expectedProductCode) {
      console.warn(
        `Product code mismatch. Received: ${resolvedData.productCode}, Expected: ${expectedProductCode}`
      );
    }

    // Query active entitlements for seats/dimension
    const entitlements = await awsMarketplaceClient.getEntitlements(
      resolvedData.customerIdentifier,
      resolvedData.productCode
    );

    let dimension = 'standard';
    let quantity = 1;
    let expirationDate: Date | undefined;

    if (entitlements.length > 0) {
      const primary = entitlements[0];
      dimension = primary.dimension;
      quantity = primary.value?.IntegerValue ?? 1;
      expirationDate = primary.expirationDate;
    }

    // Check if subscription was previously claimed in local database
    const existingSub = await getAwsSubscriptionByCustomerIdentifier(
      resolvedData.customerIdentifier
    );

    return NextResponse.json({
      success: true,
      customer: {
        customerIdentifier: resolvedData.customerIdentifier,
        productCode: resolvedData.productCode,
        customerAccountId: resolvedData.customerAWSAccountId,
        dimension,
        quantity,
        expirationDate,
        status: existingSub?.status || 'PENDING_REGISTRATION',
        isClaimed: !!existingSub,
        claimedBy: existingSub?.user
          ? { email: existingSub.user.email, name: existingSub.user.name }
          : null,
      },
    });
  } catch (error: unknown) {
    console.error('API /api/marketplace/aws/resolve error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
