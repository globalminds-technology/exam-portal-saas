/**
 * Automated Verification Test Suite for AWS Marketplace SaaS Integration
 * Run with: npx tsx test/verify-aws-marketplace.ts
 */

import {
  AwsLandingTokenSchema,
  AwsActivateSchema,
  AwsSnsEnvelopeSchema,
} from '../src/lib/marketplace/aws/validation';
import { verifySnsSignature } from '../src/lib/marketplace/aws/sns-security';
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
  console.log('🧪 AWS MARKETPLACE SAAS INTEGRATION VERIFICATION SUITE');
  console.log('======================================================\n');

  // TEST SUITE 1: AWS Landing Token Schema
  console.log('--- Test Suite 1: AWS Token Resolution Validation ---');
  {
    const validToken = AwsLandingTokenSchema.safeParse({
      token: 'x-amzn-token-dummy-test-string-valid',
    });
    assert(validToken.success, 'Valid AWS registration token is accepted');

    const emptyToken = AwsLandingTokenSchema.safeParse({ token: '' });
    assert(!emptyToken.success, 'Empty AWS registration token is rejected');

    const missingToken = AwsLandingTokenSchema.safeParse({});
    assert(!missingToken.success, 'Missing token field is rejected');
  }

  // TEST SUITE 2: AWS Activation Schema
  console.log('\n--- Test Suite 2: AWS Account Linking & Activation Schema ---');
  {
    const validActivation = AwsActivateSchema.safeParse({
      customerIdentifier: 'X12345EXAMPLE',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      customerAccountId: '906470608117',
      dimension: 'seats-500',
      quantity: 500,
    });
    assert(validActivation.success, 'Valid AWS activation payload without newAdmin is accepted');

    const validNewAdminActivation = AwsActivateSchema.safeParse({
      customerIdentifier: 'X12345EXAMPLE',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      dimension: 'enterprise',
      quantity: 1,
      newAdmin: {
        name: 'University Admin',
        email: 'admin@university.edu',
        password: 'SecurePassword123!',
      },
    });
    assert(validNewAdminActivation.success, 'Valid AWS activation with newAdmin registration is accepted');

    const missingCustomerId = AwsActivateSchema.safeParse({
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
    });
    assert(!missingCustomerId.success, 'Payload without customerIdentifier is rejected');

    const invalidAdminEmail = AwsActivateSchema.safeParse({
      customerIdentifier: 'X12345EXAMPLE',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      newAdmin: {
        name: 'Admin',
        email: 'invalid-email-format',
        password: 'password123',
      },
    });
    assert(!invalidAdminEmail.success, 'Invalid admin email format is rejected');

    const shortPassword = AwsActivateSchema.safeParse({
      customerIdentifier: 'X12345EXAMPLE',
      productCode: 'dv2kw91hf8ev5532dkuf21f3x',
      newAdmin: {
        name: 'Admin',
        email: 'admin@test.com',
        password: '123',
      },
    });
    assert(!shortPassword.success, 'Password shorter than 6 characters is rejected');
  }

  // TEST SUITE 3: AWS SNS Envelope Schema
  console.log('\n--- Test Suite 3: Amazon SNS Envelope Schema ---');
  {
    const validNotification = AwsSnsEnvelopeSchema.safeParse({
      Type: 'Notification',
      MessageId: 'msg-1234-5678-9012',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:aws-mp-subscription-notification',
      Subject: 'Amazon AWS Marketplace Notification',
      Message: JSON.stringify({
        action: 'subscribe-success',
        'customer-identifier': 'X12345EXAMPLE',
        'product-code': 'dv2kw91hf8ev5532dkuf21f3x',
      }),
      Timestamp: '2026-10-24T12:00:00.000Z',
      SignatureVersion: '1',
      Signature: 'dummy_base64_sig==',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-123.pem',
    });
    assert(validNotification.success, 'Valid Notification envelope is accepted');

    const validConfirmation = AwsSnsEnvelopeSchema.safeParse({
      Type: 'SubscriptionConfirmation',
      MessageId: 'msg-sub-confirm-1234',
      Token: '2336412f37fb687f5d51e6e241d09c805a3a57e30d718281a6f2805bfa780d6b',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:aws-mp-subscription-notification',
      Message: 'You have chosen to subscribe to the topic...',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=...',
      Timestamp: '2026-10-24T12:00:00.000Z',
      SignatureVersion: '1',
      Signature: 'dummy_base64_sig==',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-123.pem',
    });
    assert(validConfirmation.success, 'Valid SubscriptionConfirmation envelope is accepted');

    const invalidType = AwsSnsEnvelopeSchema.safeParse({
      Type: 'InvalidTypeNotSupported',
      MessageId: '123',
      TopicArn: 'arn',
      Message: 'test',
      Timestamp: 'now',
      SignatureVersion: '1',
      Signature: 'sig',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
    });
    assert(!invalidType.success, 'Unsupported SNS envelope Type is rejected');
  }

  // TEST SUITE 4: SNS Security & Untrusted URL Rejection
  console.log('\n--- Test Suite 4: Amazon SNS Security & Cert URL Validation ---');
  {
    // Test untrusted / spoofed domain in SigningCertURL
    const untrustedCertCheck = await verifySnsSignature({
      Type: 'Notification',
      MessageId: 'msg-attack',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:aws-mp',
      Message: 'malicious payload',
      Timestamp: '2026-10-24T12:00:00Z',
      SignatureVersion: '1',
      Signature: 'invalid_sig',
      SigningCertURL: 'https://malicious-attacker-domain.com/fake-cert.pem',
    });
    assert(!untrustedCertCheck.isValid, 'Rejects spoofed SigningCertURL outside amazonaws.com');

    // Test missing signature fields
    const missingSigCheck = await verifySnsSignature({
      Type: 'Notification',
      MessageId: 'msg-missing',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:aws-mp',
      Message: 'test',
      Timestamp: '2026-10-24T12:00:00Z',
      SignatureVersion: '1',
      Signature: '',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-123.pem',
    });
    assert(!missingSigCheck.isValid, 'Rejects payload with missing signature string');
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

  console.log('\n======================================================');
  console.log(`🎉 AWS MARKETPLACE TEST SUITE COMPLETED: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
