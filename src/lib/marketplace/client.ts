/**
 * Microsoft Azure Marketplace SaaS Fulfillment API Client
 * Official Version: 2018-08-31
 * Reference: https://learn.microsoft.com/en-us/partner-center/marketplace-offers/pc-saas-fulfillment-apis
 */

import { getMarketplaceAccessToken } from './auth';
import type {
  ResolvedSubscription,
  MarketplaceSubscriptionResponse,
  ActivateSubscriptionRequest,
  UpdateOperationRequest,
  MarketplaceOperationItem,
} from './types';

const API_VERSION = '2018-08-31';
const BASE_URL = 'https://marketplaceapi.microsoft.com/api/saas/subscriptions';

class MarketplaceClient {
  private async getHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
    const accessToken = await getMarketplaceAccessToken();
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
  }

  /**
   * Resolves a marketplace purchase token supplied during customer redirect.
   * Exchanged via: POST /api/saas/subscriptions/resolve?api-version=2018-08-31
   */
  async resolveSubscription(token: string): Promise<ResolvedSubscription> {
    const headers = await this.getHeaders({
      'x-ms-marketplace-token': token,
    });

    const url = `${BASE_URL}/resolve?api-version=${API_VERSION}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Marketplace resolve error:', response.status, errorText);
      throw new Error(`Failed to resolve marketplace token (Status ${response.status})`);
    }

    return (await response.json()) as ResolvedSubscription;
  }

  /**
   * Retrieves full subscription details by subscriptionId.
   * GET /api/saas/subscriptions/{subscriptionId}?api-version=2018-08-31
   */
  async getSubscription(subscriptionId: string): Promise<MarketplaceSubscriptionResponse> {
    const headers = await this.getHeaders();
    const url = `${BASE_URL}/${encodeURIComponent(subscriptionId)}?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Marketplace get subscription error:', response.status, errorText);
      throw new Error(`Failed to fetch subscription details (Status ${response.status})`);
    }

    return (await response.json()) as MarketplaceSubscriptionResponse;
  }

  /**
   * Activates a subscription in PendingFulfillmentStart state.
   * POST /api/saas/subscriptions/{subscriptionId}/activate?api-version=2018-08-31
   */
  async activateSubscription(
    subscriptionId: string,
    payload: ActivateSubscriptionRequest
  ): Promise<void> {
    const headers = await this.getHeaders();
    const url = `${BASE_URL}/${encodeURIComponent(subscriptionId)}/activate?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Marketplace activate error:', response.status, errorText);
      throw new Error(`Failed to activate subscription (Status ${response.status})`);
    }
  }

  /**
   * Updates an asynchronous operation's status (Operation callback).
   * PATCH /api/saas/subscriptions/{subscriptionId}/operations/{operationId}?api-version=2018-08-31
   */
  async updateOperationStatus(
    subscriptionId: string,
    operationId: string,
    payload: UpdateOperationRequest
  ): Promise<void> {
    const headers = await this.getHeaders();
    const url = `${BASE_URL}/${encodeURIComponent(subscriptionId)}/operations/${encodeURIComponent(operationId)}?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Marketplace update operation status error:', response.status, errorText);
      throw new Error(`Failed to update operation status (Status ${response.status})`);
    }
  }

  /**
   * Lists outstanding operations on a subscription.
   * GET /api/saas/subscriptions/{subscriptionId}/operations?api-version=2018-08-31
   */
  async listOperations(subscriptionId: string): Promise<MarketplaceOperationItem[]> {
    const headers = await this.getHeaders();
    const url = `${BASE_URL}/${encodeURIComponent(subscriptionId)}/operations?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Marketplace list operations error:', response.status, errorText);
      throw new Error(`Failed to list operations (Status ${response.status})`);
    }

    const data = (await response.json()) as { operations?: MarketplaceOperationItem[] } | MarketplaceOperationItem[];
    if (Array.isArray(data)) {
      return data;
    }
    return data.operations || [];
  }
}

export const marketplaceClient = new MarketplaceClient();
