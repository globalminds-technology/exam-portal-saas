/**
 * Marketplace Subscriptions Database Operations & State Management
 */

import { db } from '@/lib/db';
import { MarketplaceSubscriptionStatus } from '@prisma/client';
import { marketplaceClient } from './client';
import type { MarketplaceWebhookPayload } from './types';

export async function getSubscriptionByMarketplaceId(subscriptionId: string) {
  return db.marketplaceSubscription.findUnique({
    where: { subscriptionId },
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

export async function getUserSubscriptions(userId: string) {
  return db.marketplaceSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface CreateOrLinkSubscriptionParams {
  subscriptionId: string;
  subscriptionName: string;
  offerId: string;
  planId: string;
  quantity?: number;
  status: MarketplaceSubscriptionStatus;
  termUnit?: string;
  startDate?: Date;
  endDate?: Date;
  beneficiaryTenantId?: string;
  beneficiaryEmail?: string;
  purchaserTenantId?: string;
  purchaserEmail?: string;
  purchaserObjectId?: string;
  userId: string;
}

export async function linkAndActivateSubscription(params: CreateOrLinkSubscriptionParams) {
  return db.$transaction(async (tx) => {
    // 1. Check if subscription is already claimed by someone else
    const existing = await tx.marketplaceSubscription.findUnique({
      where: { subscriptionId: params.subscriptionId },
    });

    if (existing && existing.userId !== params.userId) {
      throw new Error('This Marketplace subscription is already claimed by another user account.');
    }

    // 2. Upsert the subscription record
    const subscription = await tx.marketplaceSubscription.upsert({
      where: { subscriptionId: params.subscriptionId },
      create: {
        subscriptionId: params.subscriptionId,
        subscriptionName: params.subscriptionName,
        offerId: params.offerId,
        planId: params.planId,
        quantity: params.quantity || 1,
        status: params.status,
        termUnit: params.termUnit,
        startDate: params.startDate,
        endDate: params.endDate,
        beneficiaryTenantId: params.beneficiaryTenantId,
        beneficiaryEmail: params.beneficiaryEmail,
        purchaserTenantId: params.purchaserTenantId,
        purchaserEmail: params.purchaserEmail,
        purchaserObjectId: params.purchaserObjectId,
        userId: params.userId,
        activatedAt: params.status === MarketplaceSubscriptionStatus.Subscribed ? new Date() : null,
      },
      update: {
        subscriptionName: params.subscriptionName,
        offerId: params.offerId,
        planId: params.planId,
        quantity: params.quantity || 1,
        status: params.status,
        termUnit: params.termUnit,
        startDate: params.startDate,
        endDate: params.endDate,
        beneficiaryTenantId: params.beneficiaryTenantId,
        beneficiaryEmail: params.beneficiaryEmail,
        purchaserTenantId: params.purchaserTenantId,
        purchaserEmail: params.purchaserEmail,
        purchaserObjectId: params.purchaserObjectId,
        userId: params.userId,
        activatedAt: params.status === MarketplaceSubscriptionStatus.Subscribed ? new Date() : undefined,
      },
    });

    return subscription;
  });
}

/**
 * Handles incoming webhook events idempotently.
 * Supported actions: Unsubscribe, ChangePlan, ChangeQuantity, Suspend, Reinstate, Renew
 */
export async function processWebhookEvent(payload: MarketplaceWebhookPayload) {
  // 1. Idempotency Check: see if this operation has already been recorded
  const existingOperation = await db.marketplaceOperation.findUnique({
    where: { id: payload.id },
  });

  if (existingOperation && existingOperation.processed) {
    return {
      status: 'ignored',
      message: `Operation ${payload.id} was already processed successfully.`,
      operation: existingOperation,
    };
  }

  // 2. Ensure subscription exists in database
  const subscription = await db.marketplaceSubscription.findUnique({
    where: { subscriptionId: payload.subscriptionId },
  });

  if (!subscription) {
    console.warn(`Webhook received for untracked subscriptionId: ${payload.subscriptionId}`);
  }

  // 3. Upsert operation log in InProgress state
  await db.marketplaceOperation.upsert({
    where: { id: payload.id },
    create: {
      id: payload.id,
      subscriptionId: payload.subscriptionId,
      action: payload.action,
      status: payload.status,
      planId: payload.planId,
      quantity: payload.quantity,
      rawPayload: JSON.stringify(payload),
      processed: false,
    },
    update: {
      status: payload.status,
      planId: payload.planId,
      quantity: payload.quantity,
      rawPayload: JSON.stringify(payload),
    },
  });

  // 4. State Transition based on Action
  let updateData: Partial<{
    status: MarketplaceSubscriptionStatus;
    planId: string;
    quantity: number;
  }> = {};

  switch (payload.action) {
    case 'Unsubscribe':
      updateData = { status: MarketplaceSubscriptionStatus.Unsubscribed };
      break;

    case 'Suspend':
      updateData = { status: MarketplaceSubscriptionStatus.Suspended };
      break;

    case 'Reinstate':
      updateData = { status: MarketplaceSubscriptionStatus.Subscribed };
      break;

    case 'ChangePlan':
      if (payload.planId) {
        updateData = {
          planId: payload.planId,
          status: MarketplaceSubscriptionStatus.Subscribed,
        };
      }
      break;

    case 'ChangeQuantity':
      if (payload.quantity) {
        updateData = {
          quantity: payload.quantity,
          status: MarketplaceSubscriptionStatus.Subscribed,
        };
      }
      break;

    case 'Renew':
      updateData = { status: MarketplaceSubscriptionStatus.Subscribed };
      break;

    default:
      console.warn(`Unhandled webhook action: ${payload.action}`);
  }

  // Apply update to subscription if present
  if (subscription && Object.keys(updateData).length > 0) {
    await db.marketplaceSubscription.update({
      where: { subscriptionId: payload.subscriptionId },
      data: updateData,
    });
  }

  // 5. Operation status callback to Microsoft
  // Microsoft requires acknowledging operations like ChangePlan and ChangeQuantity via PATCH /operations/{id}
  if (payload.action === 'ChangePlan' || payload.action === 'ChangeQuantity') {
    try {
      await marketplaceClient.updateOperationStatus(payload.subscriptionId, payload.id, {
        status: 'Success',
      });
    } catch (err) {
      console.error(
        `Failed to report operation status to Microsoft for operation ${payload.id}:`,
        err
      );
      // We still record the error in operation log
      await db.marketplaceOperation.update({
        where: { id: payload.id },
        data: {
          error: err instanceof Error ? err.message : 'Failed to update operation callback',
        },
      });
    }
  }

  // 6. Mark operation as completed and processed
  const completedOperation = await db.marketplaceOperation.update({
    where: { id: payload.id },
    data: {
      processed: true,
      processedAt: new Date(),
      status: 'Completed',
    },
  });

  return {
    status: 'success',
    operation: completedOperation,
  };
}
