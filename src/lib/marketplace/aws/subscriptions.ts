/**
 * AWS Marketplace Subscriptions Database Operations & State Management
 */

import { db } from '@/lib/db';
import { AwsSubscriptionStatus, Prisma } from '@prisma/client';

export async function getAwsSubscriptionByLicenseArn(licenseArn: string) {
  return db.awsMarketplaceSubscription.findUnique({
    where: { licenseArn },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function getAwsSubscriptionByAccountId(customerAccountId: string) {
  return db.awsMarketplaceSubscription.findFirst({
    where: { customerAccountId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

// Backward-compatible query
export async function getAwsSubscriptionByCustomerIdentifier(customerIdentifier: string) {
  return db.awsMarketplaceSubscription.findFirst({
    where: {
      OR: [
        { customerIdentifier },
        { customerAccountId: customerIdentifier },
        { licenseArn: customerIdentifier },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function getUserAwsSubscriptions(userId: string) {
  return db.awsMarketplaceSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface LinkAndActivateAwsParams {
  customerAccountId: string;
  productCode: string;
  licenseArn?: string;
  agreementId?: string;
  customerIdentifier?: string;
  dimension?: string;
  quantity?: number;
  expirationDate?: Date;
  userId: string;
}

/**
 * Links a customer AWS subscription to an organization administrator account.
 * Guardrail: Access is marked PENDING_EVENT until verified by License Updated event,
 * or marked SUBSCRIBED if a valid License Updated event was already received.
 */
export async function linkAndActivateAwsSubscription(params: LinkAndActivateAwsParams) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Check if subscription already exists by licenseArn or customerAccountId
    let existing = null;
    if (params.licenseArn) {
      existing = await tx.awsMarketplaceSubscription.findUnique({
        where: { licenseArn: params.licenseArn },
      });
    }

    if (!existing && params.customerIdentifier) {
      existing = await tx.awsMarketplaceSubscription.findUnique({
        where: { customerIdentifier: params.customerIdentifier },
      });
    }

    if (!existing) {
      existing = await tx.awsMarketplaceSubscription.findFirst({
        where: {
          customerAccountId: params.customerAccountId,
          productCode: params.productCode,
        },
      });
    }

    // Guard against claiming someone else's subscription
    if (existing && existing.userId !== params.userId) {
      throw new Error(
        'This AWS Marketplace subscription is already claimed by another administrator account.'
      );
    }

    // 2. Check if a License Updated event has already arrived for this customer/license
    const priorLicenseEvent = await tx.awsMarketplaceEvent.findFirst({
      where: {
        OR: [
          ...(params.licenseArn ? [{ licenseArn: params.licenseArn }] : []),
          { customerAccountId: params.customerAccountId },
        ],
        detailType: 'License Updated - Manufacturer',
        processed: true,
      },
    });

    // Determine initial status:
    // If License event arrived -> SUBSCRIBED
    // If not yet arrived -> PENDING_EVENT (access unlocked once event is received)
    const initialStatus: AwsSubscriptionStatus = priorLicenseEvent
      ? AwsSubscriptionStatus.SUBSCRIBED
      : AwsSubscriptionStatus.PENDING_EVENT;

    // 3. Upsert the AWS subscription record
    let subscription;
    if (existing) {
      subscription = await tx.awsMarketplaceSubscription.update({
        where: { id: existing.id },
        data: {
          licenseArn: params.licenseArn || existing.licenseArn,
          agreementId: params.agreementId || existing.agreementId,
          customerAccountId: params.customerAccountId || existing.customerAccountId,
          customerIdentifier: params.customerIdentifier || existing.customerIdentifier,
          productCode: params.productCode,
          dimension: params.dimension || existing.dimension,
          quantity: params.quantity || existing.quantity,
          status:
            existing.status === AwsSubscriptionStatus.SUBSCRIBED
              ? AwsSubscriptionStatus.SUBSCRIBED
              : initialStatus,
          expirationDate: params.expirationDate || existing.expirationDate,
          userId: params.userId,
          activatedAt:
            initialStatus === AwsSubscriptionStatus.SUBSCRIBED
              ? existing.activatedAt || new Date()
              : existing.activatedAt,
        },
      });
    } else {
      subscription = await tx.awsMarketplaceSubscription.create({
        data: {
          licenseArn: params.licenseArn,
          agreementId: params.agreementId,
          customerAccountId: params.customerAccountId,
          customerIdentifier: params.customerIdentifier,
          productCode: params.productCode,
          dimension: params.dimension,
          quantity: params.quantity || 1,
          status: initialStatus,
          expirationDate: params.expirationDate,
          userId: params.userId,
          activatedAt: initialStatus === AwsSubscriptionStatus.SUBSCRIBED ? new Date() : null,
        },
      });
    }

    // Link any orphaned events for this license to this subscription
    if (params.licenseArn) {
      await tx.awsMarketplaceEvent.updateMany({
        where: {
          licenseArn: params.licenseArn,
          subscriptionId: null,
        },
        data: {
          subscriptionId: subscription.id,
        },
      });
    }

    return subscription;
  });
}
