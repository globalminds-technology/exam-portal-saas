/**
 * AWS Marketplace EventBridge Event Ingestion & Processing
 * Source: aws.agreement-marketplace
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-eventbridge-integration.html
 */

import { db } from '@/lib/db';
import { AwsSubscriptionStatus } from '@prisma/client';
import { awsMarketplaceClient } from './client';
import type { AwsEventBridgeEnvelope, AwsMarketplaceAgreementDetail } from './types';

/**
 * Validates the security secret for EventBridge API Destination webhooks
 */
export function validateEventBridgeSecret(authHeader: string | null): boolean {
  const expectedSecret = process.env.AWS_EVENTBRIDGE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // If secret is not configured in development, warn but allow
    console.warn(
      'Warning: AWS_EVENTBRIDGE_WEBHOOK_SECRET is not configured in environment variables.'
    );
    return true;
  }

  if (!authHeader) {
    return false;
  }

  // Support Bearer token or direct token string
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token === expectedSecret;
}

export interface ProcessEventBridgeResult {
  status: 'success' | 'ignored' | 'error';
  eventId: string;
  detailType: string;
  licenseArn?: string;
  customerAccountId?: string;
  updatedStatus?: AwsSubscriptionStatus;
  message?: string;
}

/**
 * Idempotently processes an EventBridge event from aws.agreement-marketplace
 */
export async function processEventBridgeEvent(
  envelope: AwsEventBridgeEnvelope<AwsMarketplaceAgreementDetail>
): Promise<ProcessEventBridgeResult> {
  const eventId = envelope.id;
  const detailType = envelope['detail-type'];
  const source = envelope.source;
  const detail = envelope.detail || {};

  const licenseArn = detail.licenseArn;
  const agreementId = detail.agreementId;
  const customerAccountId = detail.customerAwsAccountId;
  const productCode = detail.productCode || process.env.AWS_MARKETPLACE_PRODUCT_CODE;

  // 1. Source verification: Must originate from AWS Marketplace Agreements
  if (source !== 'aws.agreement-marketplace') {
    console.warn(`Ignoring event from unexpected source: ${source}`);
    return {
      status: 'ignored',
      eventId,
      detailType,
      message: `Unsupported event source: ${source}`,
    };
  }

  // 2. Product code verification (if provided in payload)
  const configuredProductCode = process.env.AWS_MARKETPLACE_PRODUCT_CODE;
  if (
    configuredProductCode &&
    detail.productCode &&
    detail.productCode !== configuredProductCode
  ) {
    console.warn(
      `Ignoring event for mismatched product code: ${detail.productCode} (Expected: ${configuredProductCode})`
    );
    return {
      status: 'ignored',
      eventId,
      detailType,
      message: 'Product code mismatch',
    };
  }

  // 3. Idempotency Check: check if event was already recorded and processed
  const existingEvent = await db.awsMarketplaceEvent.findUnique({
    where: { id: eventId },
  });

  if (existingEvent && existingEvent.processed) {
    return {
      status: 'ignored',
      eventId,
      detailType,
      message: `EventBridge event ${eventId} was already processed successfully.`,
    };
  }

  // 4. Log the incoming event in InProgress state
  await db.awsMarketplaceEvent.upsert({
    where: { id: eventId },
    create: {
      id: eventId,
      licenseArn,
      agreementId,
      customerAccountId,
      source,
      detailType,
      action: detailType,
      status: 'InProgress',
      rawPayload: JSON.stringify(envelope),
      processed: false,
    },
    update: {
      source,
      detailType,
      action: detailType,
      status: 'InProgress',
      rawPayload: JSON.stringify(envelope),
    },
  });

  // 5. Locate matching subscription in database
  // Check by licenseArn first, then by agreementId, then by customerAccountId
  let subscription = null;

  if (licenseArn) {
    subscription = await db.awsMarketplaceSubscription.findUnique({
      where: { licenseArn },
    });
  }

  if (!subscription && agreementId) {
    subscription = await db.awsMarketplaceSubscription.findFirst({
      where: { agreementId },
    });
  }

  if (!subscription && customerAccountId) {
    subscription = await db.awsMarketplaceSubscription.findFirst({
      where: { customerAccountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  let newStatus: AwsSubscriptionStatus | undefined;
  let newQuantity: number | undefined;
  let newDimension: string | undefined;
  let newExpirationDate: Date | undefined;

  // 6. State Transition logic according to official AWS EventBridge semantics
  switch (detailType) {
    case 'License Updated - Manufacturer': {
      // The buyer's entitlement to a product has changed or newly provisioned
      newStatus = AwsSubscriptionStatus.SUBSCRIBED;

      // Reconcile with authoritative AWS GetEntitlements API
      if (licenseArn || customerAccountId) {
        try {
          const entitlements = await awsMarketplaceClient.getEntitlements({
            licenseArn,
            customerAccountId,
            productCode,
          });

          if (entitlements.length > 0) {
            const primary = entitlements[0];
            newDimension = primary.dimension;
            newQuantity = primary.value?.IntegerValue ?? 1;
            newExpirationDate = primary.expirationDate;
          }
        } catch (err) {
          console.warn('Failed to query fresh entitlements during License Updated event:', err);
        }
      }
      break;
    }

    case 'License Deprovisioned - Manufacturer': {
      // The buyer's entitlement to a product has ended
      newStatus = AwsSubscriptionStatus.UNSUBSCRIBED;
      break;
    }

    case 'Purchase Agreement Created - Proposer':
    case 'Purchase Agreement Created - Manufacturer': {
      // Agreement is created; status becomes PENDING_EVENT until License Updated arrives
      // or stays SUBSCRIBED if already verified
      if (!subscription || subscription.status === AwsSubscriptionStatus.PENDING_REGISTRATION) {
        newStatus = AwsSubscriptionStatus.PENDING_EVENT;
      }
      break;
    }

    case 'Purchase Agreement Ended - Proposer':
    case 'Purchase Agreement Ended - Manufacturer': {
      // An agreement has expired, is canceled, or terminated
      newStatus = AwsSubscriptionStatus.UNSUBSCRIBED;
      break;
    }

    case 'Purchase Agreement Advisory Issued - Manufacturer': {
      // Advisory that might invalidate agreement (buyer account closed, fraud, abuse)
      newStatus = AwsSubscriptionStatus.SUSPENDED;
      break;
    }

    case 'Purchase Agreement Advisory Resolved - Manufacturer': {
      // Advisory resolved, restore active status
      newStatus = AwsSubscriptionStatus.SUBSCRIBED;
      break;
    }

    default:
      console.log(`Informational or unhandled EventBridge event type: ${detailType}`);
  }

  // 7. Update subscription record if found
  if (subscription) {
    await db.awsMarketplaceSubscription.update({
      where: { id: subscription.id },
      data: {
        licenseArn: licenseArn || subscription.licenseArn,
        agreementId: agreementId || subscription.agreementId,
        customerAccountId: customerAccountId || subscription.customerAccountId,
        status: newStatus ?? subscription.status,
        quantity: newQuantity ?? subscription.quantity,
        dimension: newDimension ?? subscription.dimension,
        expirationDate: newExpirationDate ?? subscription.expirationDate,
        activatedAt:
          newStatus === AwsSubscriptionStatus.SUBSCRIBED
            ? subscription.activatedAt || new Date()
            : subscription.activatedAt,
      },
    });

    // Link event to subscription
    await db.awsMarketplaceEvent.update({
      where: { id: eventId },
      data: {
        subscriptionId: subscription.id,
      },
    });
  } else {
    console.info(
      `EventBridge event recorded for pending buyer (Customer Account: ${customerAccountId || 'N/A'}, License: ${licenseArn || 'N/A'}). Will link when buyer completes onboarding.`
    );
  }

  // 8. Mark event as processed
  await db.awsMarketplaceEvent.update({
    where: { id: eventId },
    data: {
      status: 'Completed',
      processed: true,
      processedAt: new Date(),
    },
  });

  return {
    status: 'success',
    eventId,
    detailType,
    licenseArn,
    customerAccountId,
    updatedStatus: newStatus,
  };
}
