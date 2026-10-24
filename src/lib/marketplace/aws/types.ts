/**
 * AWS Marketplace SaaS Contracts & Subscriptions Data Contracts & Types
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-integration.html
 */

export type AwsMarketplaceAction =
  | 'subscribe-success'
  | 'subscribe-fail'
  | 'unsubscribe-pending'
  | 'unsubscribe-success'
  | 'entitlement-updated';

export interface AwsResolveCustomerResponse {
  customerIdentifier: string;
  productCode: string;
  customerAWSAccountId?: string;
}

import type { EntitlementValue } from '@aws-sdk/client-marketplace-entitlement-service';

export interface AwsEntitlementItem {
  dimension: string;
  value?: EntitlementValue;
  expirationDate?: Date;
}

export interface AwsSnsNotificationPayload {
  action: AwsMarketplaceAction;
  'customer-identifier': string;
  'product-code': string;
  'is-free-trial-term-present'?: boolean;
  'effective-date'?: string;
}

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
