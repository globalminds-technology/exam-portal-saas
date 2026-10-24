/**
 * AWS Marketplace Subscriptions Database Operations & State Management
 */

import { db } from '@/lib/db';
import { AwsSubscriptionStatus, Prisma } from '@prisma/client';
import { awsMarketplaceClient } from './client';
import type { AwsSnsNotificationPayload } from './types';

export async function getAwsSubscriptionByCustomerIdentifier(customerIdentifier: string) {
  return db.awsMarketplaceSubscription.findUnique({
    where: { customerIdentifier },
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
  customerIdentifier: string;
  customerAccountId?: string;
  productCode: string;
  dimension?: string;
  quantity?: number;
  expirationDate?: Date;
  userId: string;
}

export async function linkAndActivateAwsSubscription(params: LinkAndActivateAwsParams) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Check if subscription is already linked to another administrator
    const existing = await tx.awsMarketplaceSubscription.findUnique({
      where: { customerIdentifier: params.customerIdentifier },
    });

    if (existing && existing.userId !== params.userId) {
      throw new Error(
        'This AWS Marketplace subscription is already claimed by another administrator account.'
      );
    }

    // 2. Upsert the AWS subscription record with SUBSCRIBED status
    const subscription = await tx.awsMarketplaceSubscription.upsert({
      where: { customerIdentifier: params.customerIdentifier },
      create: {
        customerIdentifier: params.customerIdentifier,
        customerAccountId: params.customerAccountId,
        productCode: params.productCode,
        dimension: params.dimension,
        quantity: params.quantity || 1,
        status: AwsSubscriptionStatus.SUBSCRIBED,
        expirationDate: params.expirationDate,
        userId: params.userId,
        activatedAt: new Date(),
      },
      update: {
        customerAccountId: params.customerAccountId,
        productCode: params.productCode,
        dimension: params.dimension,
        quantity: params.quantity || 1,
        status: AwsSubscriptionStatus.SUBSCRIBED,
        expirationDate: params.expirationDate,
        userId: params.userId,
        activatedAt: existing?.activatedAt || new Date(),
      },
    });

    return subscription;
  });
}

/**
 * Processes incoming Amazon SNS subscription lifecycle notifications idempotently.
 * Supported actions: subscribe-success, subscribe-fail, unsubscribe-pending, unsubscribe-success, entitlement-updated
 */
export async function processAwsSnsNotification(
  payload: AwsSnsNotificationPayload,
  messageId: string
) {
  const customerIdentifier = payload['customer-identifier'];
  const action = payload.action;

  // 1. Idempotency Check: see if this operation has already been recorded
  const existingEvent = await db.awsMarketplaceEvent.findUnique({
    where: { id: messageId },
  });

  if (existingEvent && existingEvent.processed) {
    return {
      status: 'ignored',
      message: `SNS message ${messageId} was already processed successfully.`,
    };
  }

  // 2. Upsert event record in InProgress state
  await db.awsMarketplaceEvent.upsert({
    where: { id: messageId },
    create: {
      id: messageId,
      customerIdentifier,
      action,
      status: 'InProgress',
      rawPayload: JSON.stringify(payload),
      processed: false,
    },
    update: {
      action,
      status: 'InProgress',
      rawPayload: JSON.stringify(payload),
    },
  });

  // 3. Determine target subscription status
  let newStatus: AwsSubscriptionStatus | undefined;
  switch (action) {
    case 'subscribe-success':
      newStatus = AwsSubscriptionStatus.SUBSCRIBED;
      break;
    case 'subscribe-fail':
      newStatus = AwsSubscriptionStatus.UNSUBSCRIBED;
      break;
    case 'unsubscribe-pending':
      newStatus = AwsSubscriptionStatus.SUSPENDED;
      break;
    case 'unsubscribe-success':
      newStatus = AwsSubscriptionStatus.UNSUBSCRIBED;
      break;
    case 'entitlement-updated':
      newStatus = AwsSubscriptionStatus.SUBSCRIBED;
      break;
    default:
      console.warn(`Unhandled AWS Marketplace action: ${action}`);
  }

  // 4. Update the subscription record if it exists
  const subscription = await db.awsMarketplaceSubscription.findUnique({
    where: { customerIdentifier },
  });

  if (subscription) {
    let dimension = subscription.dimension;
    let quantity = subscription.quantity;
    let expirationDate = subscription.expirationDate;

    // Fetch fresh entitlements if action is entitlement-updated
    if (action === 'entitlement-updated') {
      try {
        const entitlements = await awsMarketplaceClient.getEntitlements(
          customerIdentifier,
          payload['product-code']
        );
        if (entitlements.length > 0) {
          const first = entitlements[0];
          dimension = first.dimension;
          quantity = first.value?.IntegerValue ?? quantity;
          expirationDate = first.expirationDate || expirationDate;
        }
      } catch (err) {
        console.warn('Failed to query updated entitlements:', err);
      }
    }

    await db.awsMarketplaceSubscription.update({
      where: { customerIdentifier },
      data: {
        status: newStatus || subscription.status,
        dimension,
        quantity,
        expirationDate,
      },
    });
  } else {
    console.warn(
      `Received SNS event for unregistered AWS CustomerIdentifier: ${customerIdentifier}`
    );
  }

  // 5. Mark the event as processed
  await db.awsMarketplaceEvent.update({
    where: { id: messageId },
    data: {
      status: 'Completed',
      processed: true,
      processedAt: new Date(),
    },
  });

  return {
    status: 'success',
    action,
    customerIdentifier,
    updatedStatus: newStatus,
  };
}
