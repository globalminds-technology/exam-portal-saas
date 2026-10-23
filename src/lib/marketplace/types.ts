/**
 * Microsoft Azure Marketplace SaaS Fulfillment API Contracts & Types
 * Conforms to API version 2018-08-31
 * Reference: https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-apis
 */

export type MarketplaceAction =
  | 'Unsubscribe'
  | 'ChangePlan'
  | 'ChangeQuantity'
  | 'Suspend'
  | 'Reinstate'
  | 'Renew';

export type SaaSStatus =
  | 'NotStarted'
  | 'PendingFulfillmentStart'
  | 'Subscribed'
  | 'Suspended'
  | 'Unsubscribed';

export type OperationStatus =
  | 'NotStarted'
  | 'InProgress'
  | 'Succeeded'
  | 'Completed'
  | 'Failed'
  | 'Conflict'
  | (string & {});

export interface UserDetails {
  email?: string;
  puid?: string;
  tenantId?: string;
  objectId?: string;
}

export interface TermDetails {
  termUnit?: string; // e.g. P1M, P1Y
  startDate?: string;
  endDate?: string;
}

export interface ResolvedSubscription {
  id: string; // Subscription GUID
  subscriptionName: string;
  offerId: string;
  planId: string;
  quantity?: number;
  subscription?: {
    id: string;
    publisherId: string;
    offerId: string;
    name: string;
    saasSubscriptionStatus: SaaSStatus;
    beneficiary?: UserDetails;
    purchaser?: UserDetails;
    planId: string;
    term?: TermDetails;
    isTest?: boolean;
    isFreeTrial?: boolean;
    allowedCustomerOperations?: string[];
    sandboxType?: string;
  };
}

export interface MarketplaceSubscriptionResponse {
  id: string;
  publisherId: string;
  offerId: string;
  name: string;
  saasSubscriptionStatus: SaaSStatus;
  beneficiary?: UserDetails;
  purchaser?: UserDetails;
  planId: string;
  quantity?: number;
  term?: TermDetails;
  isTest?: boolean;
  isFreeTrial?: boolean;
  allowedCustomerOperations?: string[];
  sessionMode?: string;
  sandboxType?: string;
  created?: string;
  lastModified?: string;
}

export interface ActivateSubscriptionRequest {
  planId: string;
  quantity?: number;
}

export interface UpdateOperationRequest {
  status: 'Success' | 'Failure';
  planId?: string;
  quantity?: number;
}

export interface MarketplaceOperationItem {
  id: string;
  activityId?: string;
  subscriptionId: string;
  offerId?: string;
  publisherId?: string;
  planId?: string;
  quantity?: number;
  action: MarketplaceAction;
  timeStamp: string;
  status: OperationStatus;
}

export interface MarketplaceWebhookPayload {
  id: string; // Operation ID GUID
  activityId?: string;
  subscriptionId: string;
  offerId?: string;
  publisherId?: string;
  planId?: string;
  quantity?: number;
  action: MarketplaceAction;
  timeStamp: string;
  status: OperationStatus;
}
