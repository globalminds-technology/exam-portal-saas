/**
 * Automated Verification Test Suite for AWS Marketplace EventBridge SaaS Integration
 * Run with: npm run test:marketplace:aws
 */

import {
  AwsLandingTokenSchema,
  AwsActivateSchema,
  AwsEventBridgeEnvelopeSchema,
} from '../src/lib/marketplace/aws/validation';
import { validateEventBridgeSecret } from '../src/lib/marketplace/aws/eventbridge';
import { buildEntitlementFilter } from '../src/lib/marketplace/aws/client';
import {
  ResolveTokenSchema as AzureResolveTokenSchema,
  ActivateSubscriptionSchema as AzureActivateSchema,
  MarketplaceWebhookSchema as AzureWebhookSchema,
} from '../src/lib/marketplace/validation';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ PASS: ${message}`);
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    throw new Error(`Test failed: ${message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 AWS MARKETPLACE EVENTBRIDGE INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  // TEST SUITE 1: AWS Landing Token Schema
  console.log('--- Test Suite 1: AWS Token Resolution Validation ---');
  {
    const validToken = AwsLandingTokenSchema.safeParse({
      token: 'x-amzn-token-sample-valid-2026',
    });
    assert(validToken.success, 'Valid AWS registration token is accepted');

    const emptyToken = AwsLandingTokenSchema.safeParse({ token: '' });
    assert(!emptyToken.success, 'Empty AWS registration token is rejected');

    const missingToken = AwsLandingTokenSchema.safeParse({});
    assert(!missingToken.success, 'Missing token field is rejected');
  }

  // TEST SUITE 2: AWS Activation Schema with CustomerAWSAccountId & LicenseArn
  console.log('\n--- Test Suite 2: AWS Account Linking & Activation Schema ---');
  {
    const validActivation = AwsActivateSchema.safeParse({
      customerAccountId: '906470608117',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      licenseArn: 'arn:aws:marketplace::906470608117:license:lic-12345678-abcd',
      dimension: 'seats-500',
      quantity: 500,
    });
    assert(validActivation.success, 'Valid activation payload with customerAccountId & licenseArn is accepted');

    const validNewAdminActivation = AwsActivateSchema.safeParse({
      customerAccountId: '906470608117',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      licenseArn: 'arn:aws:marketplace::906470608117:license:lic-enterprise',
      newAdmin: {
        name: 'University Registrar',
        email: 'registrar@university.edu',
        password: 'SecurePassword123!',
      },
    });
    assert(validNewAdminActivation.success, 'Valid activation with newAdmin registration is accepted');

    const missingAccountId = AwsActivateSchema.safeParse({
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
    });
    assert(!missingAccountId.success, 'Payload without customerAccountId is rejected');

    const missingProductCode = AwsActivateSchema.safeParse({
      customerAccountId: '906470608117',
    });
    assert(!missingProductCode.success, 'Payload without productCode is rejected');

    const invalidEmail = AwsActivateSchema.safeParse({
      customerAccountId: '906470608117',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      newAdmin: {
        name: 'Admin',
        email: 'not-an-email',
        password: 'password123',
      },
    });
    assert(!invalidEmail.success, 'Invalid email in newAdmin is rejected');
  }

  // TEST SUITE 3: EventBridge Envelope Schemas & Official Event Types
  console.log('\n--- Test Suite 3: Amazon EventBridge Official Envelope Schemas ---');
  {
    // 3.1 License Updated - Manufacturer
    const licenseUpdatedEvent = AwsEventBridgeEnvelopeSchema.safeParse({
      version: '0',
      id: 'eb-event-1234-5678',
      'detail-type': 'License Updated - Manufacturer',
      source: 'aws.agreement-marketplace',
      account: '906470608117',
      time: '2026-10-24T12:00:00Z',
      region: 'us-east-1',
      resources: ['arn:aws:aws-marketplace::aws:agreement:agmt-sample123'],
      detail: {
        agreementId: 'agmt-sample123',
        licenseArn: 'arn:aws:marketplace::906470608117:license:lic-abc123',
        productCode: 'dv2kw91hf8ev5532dkuf21f3x',
        customerAwsAccountId: '111122223333',
        agreementStatus: 'ACTIVE',
      },
    });
    assert(licenseUpdatedEvent.success, 'Valid License Updated - Manufacturer event is accepted');

    // 3.2 License Deprovisioned - Manufacturer
    const licenseDeprovisionedEvent = AwsEventBridgeEnvelopeSchema.safeParse({
      version: '0',
      id: 'eb-event-9999-0000',
      'detail-type': 'License Deprovisioned - Manufacturer',
      source: 'aws.agreement-marketplace',
      account: '906470608117',
      time: '2026-10-24T12:00:00Z',
      region: 'us-east-1',
      resources: [],
      detail: {
        agreementId: 'agmt-sample123',
        licenseArn: 'arn:aws:marketplace::906470608117:license:lic-abc123',
        customerAwsAccountId: '111122223333',
        agreementStatus: 'EXPIRED',
      },
    });
    assert(licenseDeprovisionedEvent.success, 'Valid License Deprovisioned event is accepted');

    // 3.3 Purchase Agreement Created - Proposer
    const agreementCreatedEvent = AwsEventBridgeEnvelopeSchema.safeParse({
      version: '0',
      id: 'eb-agmt-created-1',
      'detail-type': 'Purchase Agreement Created - Proposer',
      source: 'aws.agreement-marketplace',
      account: '906470608117',
      time: '2026-10-24T12:00:00Z',
      region: 'us-east-1',
      resources: [],
      detail: {
        agreementId: 'agmt-sample123',
        customerAwsAccountId: '111122223333',
        productCode: 'dv2kw91hf8ev5532dkuf21f3x',
        agreementStatus: 'ACTIVE',
      },
    });
    assert(agreementCreatedEvent.success, 'Valid Purchase Agreement Created event is accepted');

    // 3.4 Missing required detail-type or id
    const invalidEnvelope = AwsEventBridgeEnvelopeSchema.safeParse({
      source: 'aws.agreement-marketplace',
      detail: {},
    });
    assert(!invalidEnvelope.success, 'Malformed EventBridge event without id and detail-type is rejected');
  }

  // TEST SUITE 4: Webhook Security & Shared Secret Enforcement
  console.log('\n--- Test Suite 4: EventBridge Webhook Secret Authentication ---');
  {
    process.env.AWS_EVENTBRIDGE_WEBHOOK_SECRET = 'secret_test_key_12345';

    const validBearer = validateEventBridgeSecret('Bearer secret_test_key_12345');
    assert(validBearer, 'Accepts valid Bearer token matching configured secret');

    const validDirect = validateEventBridgeSecret('secret_test_key_12345');
    assert(validDirect, 'Accepts valid direct token string');

    const invalidSecret = validateEventBridgeSecret('Bearer wrong_secret');
    assert(!invalidSecret, 'Rejects invalid secret token');

    const missingHeader = validateEventBridgeSecret(null);
    assert(!missingHeader, 'Rejects null or missing authorization header');
  }

  // TEST SUITE 5: Regression Check for Microsoft Azure Integration
  console.log('\n--- Test Suite 5: Azure Marketplace Non-Regression Check ---');
  {
    const azureResolve = AzureResolveTokenSchema.safeParse({
      token: 'valid_azure_purchase_token_sample',
    });
    assert(azureResolve.success, 'Azure ResolveTokenSchema remains functional');

    const azureActivate = AzureActivateSchema.safeParse({
      subscriptionId: 'd3b07384-d113-40e9-b5f7-640a3250bb75',
      planId: 'gold-tier',
      quantity: 10,
    });
    assert(azureActivate.success, 'Azure ActivateSubscriptionSchema remains functional');

    const azureWebhook = AzureWebhookSchema.safeParse({
      id: 'op-1234',
      subscriptionId: 'sub-5678',
      action: 'ChangePlan',
      planId: 'platinum-tier',
      timeStamp: '2026-10-24T12:00:00Z',
      status: 'InProgress',
    });
    assert(azureWebhook.success, 'Azure MarketplaceWebhookSchema remains functional');
  }

  // TEST SUITE 6: AWS Entitlement Filter & Resolution Logic
  console.log('\n--- Test Suite 6: AWS Entitlement Filter Builder (Post-July 2026 & Legacy) ---');
  {
    // 6.1 LICENSE_ARN primary filter
    const licenseFilter = buildEntitlementFilter({
      licenseArn: 'arn:aws:marketplace::906470608117:license:lic-test-123',
      customerAccountId: '906470608117',
    });
    assert(
      licenseFilter !== undefined &&
        licenseFilter.LICENSE_ARN?.[0] === 'arn:aws:marketplace::906470608117:license:lic-test-123',
      'LICENSE_ARN takes precedence when licenseArn is present'
    );
    assert(
      licenseFilter?.CUSTOMER_AWS_ACCOUNT_ID === undefined,
      'CUSTOMER_AWS_ACCOUNT_ID is omitted when LICENSE_ARN is specified'
    );

    // 6.2 CUSTOMER_AWS_ACCOUNT_ID modern filter (when licenseArn not available)
    const accountFilter = buildEntitlementFilter({
      customerAccountId: '906470608117',
    });
    assert(
      accountFilter !== undefined &&
        accountFilter.CUSTOMER_AWS_ACCOUNT_ID?.[0] === '906470608117',
      'CUSTOMER_AWS_ACCOUNT_ID filter built correctly for modern accounts'
    );
    assert(
      accountFilter?.CUSTOMER_IDENTIFIER === undefined,
      'CUSTOMER_IDENTIFIER is not included with CUSTOMER_AWS_ACCOUNT_ID (mutually exclusive)'
    );

    // 6.3 Legacy CUSTOMER_IDENTIFIER filter
    const legacyFilter = buildEntitlementFilter({
      customerIdentifier: 'cust-legacy-identifier-xyz',
    });
    assert(
      legacyFilter !== undefined &&
        legacyFilter.CUSTOMER_IDENTIFIER?.[0] === 'cust-legacy-identifier-xyz',
      'CUSTOMER_IDENTIFIER filter built correctly for legacy accounts'
    );

    // 6.4 Empty options
    const emptyFilter = buildEntitlementFilter({});
    assert(emptyFilter === undefined, 'Empty filter options return undefined (queries all entitlements for product)');
  }

  console.log('\n======================================================');
  console.log(`🎉 AWS MARKETPLACE TEST SUITE COMPLETED: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
