/**
 * AWS Marketplace SaaS Contracts, Subscriptions & EventBridge Contracts
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-eventbridge-integration.html
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-product-customer-setup.html
 */

import type { EntitlementValue } from '@aws-sdk/client-marketplace-entitlement-service';

export interface AwsResolveCustomerResponse {
  customerAccountId: string;
  productCode: string;
  licenseArn?: string;
  customerIdentifier?: string; // Legacy field for pre-July 15, 2026 sellers
}

export interface AwsEntitlementItem {
  dimension: string;
  value?: EntitlementValue;
  expirationDate?: Date;
}

export type AwsEventBridgeDetailType =
  | 'License Updated - Manufacturer'
  | 'License Deprovisioned - Manufacturer'
  | 'Purchase Agreement Created - Proposer'
  | 'Purchase Agreement Created - Manufacturer'
  | 'Purchase Agreement Ended - Proposer'
  | 'Purchase Agreement Ended - Manufacturer'
  | 'Purchase Agreement Amended - Proposer'
  | 'Purchase Agreement Amended - Manufacturer'
  | 'Purchase Agreement Advisory Issued - Manufacturer'
  | 'Purchase Agreement Advisory Resolved - Manufacturer';

export interface AwsMarketplaceAgreementDetail {
  requestId?: string;
  catalog?: string;
  agreementId?: string;
  licenseArn?: string;
  productCode?: string;
  customerAwsAccountId?: string;
  agreementStatus?: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'CANCELLED' | string;
  advisoryType?: string;
}

export interface AwsEventBridgeEnvelope<T = AwsMarketplaceAgreementDetail> {
  version: string;
  id: string; // EventBridge UUID (used for idempotency)
  'detail-type': AwsEventBridgeDetailType | string;
  source: string; // 'aws.agreement-marketplace'
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: T;
}

// SQS Envelope wrapping an EventBridge notification
export interface AwsSqsEventBridgeMessage {
  MessageId: string;
  ReceiptHandle: string;
  Body: string; // JSON serialized AwsEventBridgeEnvelope
  Attributes?: Record<string, string>;
}

// Legacy SNS Envelope (kept for transition compatibility)
export interface AwsSnsMessageEnvelope {
  Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
}

