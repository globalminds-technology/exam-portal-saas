/**
 * AWS Marketplace Metering, Entitlement & SQS Client
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-eventbridge-integration.html
 * Reference: https://docs.aws.amazon.com/marketplace/latest/userguide/saas-product-customer-setup.html
 */

import {
  MarketplaceMeteringClient,
  ResolveCustomerCommand,
} from '@aws-sdk/client-marketplace-metering';
import {
  MarketplaceEntitlementServiceClient,
  GetEntitlementsCommand,
} from '@aws-sdk/client-marketplace-entitlement-service';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
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

export interface GetEntitlementOptions {
  licenseArn?: string;
  customerIdentifier?: string;
  productCode?: string;
}

class AwsMarketplaceClient {
  private meteringClient: MarketplaceMeteringClient | null = null;
  private entitlementClient: MarketplaceEntitlementServiceClient | null = null;
  private sqsClient: SQSClient | null = null;

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

  public getSqsClient(): SQSClient {
    if (!this.sqsClient) {
      const config = getAwsCredentials();
      this.sqsClient = new SQSClient(config);
    }
    return this.sqsClient;
  }

  /**
   * Resolves the registration token passed by AWS Marketplace when the buyer clicks 'Set Up Your Account'
   * For integrations created after July 15, 2026, AWS returns CustomerAWSAccountId and LicenseArn.
   */
  async resolveCustomer(registrationToken: string): Promise<AwsResolveCustomerResponse> {
    try {
      const client = this.getMeteringClient();
      const command = new ResolveCustomerCommand({
        RegistrationToken: registrationToken,
      });

      const response = await client.send(command);

      // Support both modern (CustomerAWSAccountId / LicenseArn) and legacy (CustomerIdentifier)
      const raw = response as unknown as Record<string, unknown>;
      const customerAccountId = (raw.CustomerAWSAccountId || raw.customerAWSAccountId || '') as string;
      const licenseArn = (raw.LicenseArn || raw.licenseArn) as string | undefined;
      const customerIdentifier = response.CustomerIdentifier;
      const productCode = response.ProductCode;

      if (!productCode || (!customerAccountId && !customerIdentifier)) {
        throw new Error('AWS ResolveCustomer returned incomplete customer account identifiers');
      }

      return {
        customerAccountId: customerAccountId || customerIdentifier || 'unknown',
        productCode,
        licenseArn,
        customerIdentifier,
      };
    } catch (error: unknown) {
      console.error('AWS ResolveCustomer API error:', error);
      const message = error instanceof Error ? error.message : 'Failed to resolve AWS customer token';
      throw new Error(`AWS Marketplace token resolution failed: ${message}`);
    }
  }

  /**
   * Retrieves active entitlements for the customer using LicenseArn (recommended) or CustomerIdentifier
   */
  async getEntitlements(options: GetEntitlementOptions): Promise<AwsEntitlementItem[]> {
    const code = options.productCode || process.env.AWS_MARKETPLACE_PRODUCT_CODE;
    if (!code) {
      console.warn('AWS_MARKETPLACE_PRODUCT_CODE is not configured; skipping entitlement lookup.');
      return [];
    }

    try {
      const client = this.getEntitlementClient();
      const filter: Record<string, string[]> = {};

      if (options.licenseArn) {
        // Query using LicenseArn (post-July 15, 2026 specification)
        filter.LICENSE_ARN = [options.licenseArn];
      } else if (options.customerIdentifier) {
        // Legacy query using CustomerIdentifier
        filter.CUSTOMER_IDENTIFIER = [options.customerIdentifier];
      }

      const command = new GetEntitlementsCommand({
        ProductCode: code,
        Filter: Object.keys(filter).length > 0 ? filter : undefined,
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
      return [];
    }
  }

  /**
   * Pulls messages from an Amazon SQS queue connected to EventBridge
   */
  async receiveSqsMessages(queueUrl: string, maxMessages = 10) {
    const client = this.getSqsClient();
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.min(maxMessages, 10),
      WaitTimeSeconds: 5,
    });
    return client.send(command);
  }

  /**
   * Deletes a processed message from the Amazon SQS queue
   */
  async deleteSqsMessage(queueUrl: string, receiptHandle: string) {
    const client = this.getSqsClient();
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });
    return client.send(command);
  }
}

export const awsMarketplaceClient = new AwsMarketplaceClient();
