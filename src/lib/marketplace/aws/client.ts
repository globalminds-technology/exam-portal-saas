/**
 * AWS Marketplace Metering & Entitlement API Client
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-integration.html
 */

import {
  MarketplaceMeteringClient,
  ResolveCustomerCommand,
} from '@aws-sdk/client-marketplace-metering';
import {
  MarketplaceEntitlementServiceClient,
  GetEntitlementsCommand,
} from '@aws-sdk/client-marketplace-entitlement-service';
import type { AwsResolveCustomerResponse, AwsEntitlementItem } from './types';

function getAwsCredentials() {
  const accessKeyId = process.env.AWS_MARKETPLACE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_MARKETPLACE_SECRET_ACCESS_KEY;
  const region = process.env.AWS_MARKETPLACE_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    console.warn(
      'Warning: AWS_MARKETPLACE_ACCESS_KEY_ID or AWS_MARKETPLACE_SECRET_ACCESS_KEY not configured.'
    );
  }

  return {
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
  };
}

class AwsMarketplaceClient {
  private meteringClient: MarketplaceMeteringClient | null = null;
  private entitlementClient: MarketplaceEntitlementServiceClient | null = null;

  private getMeteringClient(): MarketplaceMeteringClient {
    if (!this.meteringClient) {
      const config = getAwsCredentials();
      this.meteringClient = new MarketplaceMeteringClient(config);
    }
    return this.meteringClient;
  }

  private getEntitlementClient(): MarketplaceEntitlementServiceClient {
    if (!this.entitlementClient) {
      const config = getAwsCredentials();
      this.entitlementClient = new MarketplaceEntitlementServiceClient(config);
    }
    return this.entitlementClient;
  }

  /**
   * Resolves the registration token passed by AWS when the buyer clicks 'Set Up Your Account'
   */
  async resolveCustomer(registrationToken: string): Promise<AwsResolveCustomerResponse> {
    try {
      const client = this.getMeteringClient();
      const command = new ResolveCustomerCommand({
        RegistrationToken: registrationToken,
      });

      const response = await client.send(command);

      if (!response.CustomerIdentifier || !response.ProductCode) {
        throw new Error('AWS ResolveCustomer returned incomplete customer data');
      }

      return {
        customerIdentifier: response.CustomerIdentifier,
        productCode: response.ProductCode,
        customerAWSAccountId: (response as { CustomerAWSAccountId?: string }).CustomerAWSAccountId,
      };
    } catch (error: unknown) {
      console.error('AWS ResolveCustomer API error:', error);
      const message = error instanceof Error ? error.message : 'Failed to resolve AWS customer token';
      throw new Error(`AWS Marketplace token resolution failed: ${message}`);
    }
  }

  /**
   * Retrieves active entitlements for the customer
   */
  async getEntitlements(
    customerIdentifier: string,
    productCode?: string
  ): Promise<AwsEntitlementItem[]> {
    const code = productCode || process.env.AWS_MARKETPLACE_PRODUCT_CODE;
    if (!code) {
      console.warn('AWS_MARKETPLACE_PRODUCT_CODE is not configured; skipping entitlement lookup.');
      return [];
    }

    try {
      const client = this.getEntitlementClient();
      const command = new GetEntitlementsCommand({
        ProductCode: code,
        Filter: {
          CUSTOMER_IDENTIFIER: [customerIdentifier],
        },
      });

      const response = await client.send(command);

      if (!response.Entitlements || response.Entitlements.length === 0) {
        return [];
      }

      return response.Entitlements.map((item) => ({
        dimension: item.Dimension || 'default',
        value: item.Value,
        expirationDate: item.ExpirationDate,
      }));
    } catch (error: unknown) {
      console.error('AWS GetEntitlements API error:', error);
      // Entitlements may not be available for SaaS Subscriptions (usage-based) vs Contracts
      return [];
    }
  }
}

export const awsMarketplaceClient = new AwsMarketplaceClient();
