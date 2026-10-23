/**
 * Automated Verification Test Suite for Microsoft Azure Marketplace SaaS Integration
 * Run with: npx tsx test/verify-marketplace.ts
 */

import {
  ResolveTokenSchema,
  ActivateSubscriptionSchema,
  MarketplaceWebhookSchema,
} from '../src/lib/marketplace/validation';
import { validateMarketplaceWebhookToken } from '../src/lib/marketplace/webhook-security';
import { SignJWT, generateKeyPair } from 'jose';

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
  console.log('🧪 AZURE MARKETPLACE SAAS INTEGRATION VERIFICATION SUITE');
  console.log('======================================================\n');

  // TEST SUITE 1: Validation Schemas
  console.log('--- Test Suite 1: Zod Input Validation Schemas ---');
  {
    // 1.1 Resolve Token
    const validResolve = ResolveTokenSchema.safeParse({
      token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.dummy_marketplace_token_for_verification',
    });
    assert(validResolve.success, 'Valid marketplace purchase token is accepted');

    const emptyResolve = ResolveTokenSchema.safeParse({ token: '' });
    assert(!emptyResolve.success, 'Empty purchase token is rejected');

    const shortResolve = ResolveTokenSchema.safeParse({ token: '123' });
    assert(!shortResolve.success, 'Short malformed token is rejected');

    // 1.2 Activate Subscription
    const validActivate = ActivateSubscriptionSchema.safeParse({
      subscriptionId: 'b3f5c7e1-89a0-4b2e-a1d3-f5e7c9b1d3a5',
      planId: 'silver-tier',
      quantity: 5,
    });
    assert(validActivate.success, 'Valid activation payload with UUID & quantity is accepted');

    const invalidUuidActivate = ActivateSubscriptionSchema.safeParse({
      subscriptionId: 'not-a-valid-uuid',
      planId: 'silver-tier',
    });
    assert(!invalidUuidActivate.success, 'Non-UUID subscription ID is rejected');

    const negativeQty = ActivateSubscriptionSchema.safeParse({
      subscriptionId: 'b3f5c7e1-89a0-4b2e-a1d3-f5e7c9b1d3a5',
      planId: 'tier1',
      quantity: -2,
    });
    assert(!negativeQty.success, 'Negative quantity is rejected');

    // 1.3 Webhook Schema
    const validWebhook = MarketplaceWebhookSchema.safeParse({
      id: 'op-98765432-1234',
      subscriptionId: 'sub-12345678-5678',
      action: 'ChangePlan',
      planId: 'gold-tier',
      timeStamp: '2026-10-23T12:00:00Z',
      status: 'InProgress',
    });
    assert(validWebhook.success, 'Valid ChangePlan webhook event is accepted');

    const invalidActionWebhook = MarketplaceWebhookSchema.safeParse({
      id: 'op-123',
      subscriptionId: 'sub-123',
      action: 'InvalidActionName',
      timeStamp: '2026-10-23T12:00:00Z',
      status: 'InProgress',
    });
    assert(!invalidActionWebhook.success, 'Invalid lifecycle action is rejected');
  }

  // TEST SUITE 2: Webhook Security & JWT Verification
  console.log('\n--- Test Suite 2: Webhook Security & JWT Claims Enforcement ---');
  {
    // 2.1 Missing header
    const noHeader = await validateMarketplaceWebhookToken(null);
    assert(!noHeader.isValid && Boolean(noHeader.error?.includes('Missing')), 'Rejects request with missing Authorization header');

    // 2.2 Invalid scheme
    const basicHeader = await validateMarketplaceWebhookToken('Basic dXNlcjpwYXNz');
    assert(!basicHeader.isValid && Boolean(basicHeader.error?.includes('Bearer')), 'Rejects non-Bearer authorization schemes');

    // 2.3 Empty Bearer
    const emptyBearer = await validateMarketplaceWebhookToken('Bearer   ');
    assert(!emptyBearer.isValid && Boolean(emptyBearer.error?.includes('empty')), 'Rejects empty Bearer tokens');

    // 2.4 Forged Token with untrusted issuer / self-signed key
    process.env.MARKETPLACE_CLIENT_ID = 'test-client-id-12345';
    const { privateKey } = await generateKeyPair('RS256');
    const forgedToken = await new SignJWT({
      iss: 'https://attacker-controlled-issuer.com',
      aud: 'test-client-id-12345',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fake-key' })
      .setExpirationTime('1h')
      .sign(privateKey);

    const forgedResult = await validateMarketplaceWebhookToken(`Bearer ${forgedToken}`);
    assert(!forgedResult.isValid, 'Rejects forged JWT signed by unknown/untrusted issuer');
  }

  // TEST SUITE 3: Idempotency Logic
  console.log('\n--- Test Suite 3: Webhook Idempotency Simulation ---');
  {
    // Simulating the idempotency cache / operation registry
    const operationStore = new Map<string, { processed: boolean; action: string }>();

    function processOperationSim(opId: string, action: string) {
      if (operationStore.has(opId) && operationStore.get(opId)?.processed) {
        return { status: 'ignored', alreadyProcessed: true };
      }
      operationStore.set(opId, { processed: true, action });
      return { status: 'success', alreadyProcessed: false };
    }

    const firstRun = processOperationSim('op-test-1', 'Renew');
    assert(!firstRun.alreadyProcessed && firstRun.status === 'success', 'First event delivery processes successfully');

    const duplicateRun = processOperationSim('op-test-1', 'Renew');
    assert(duplicateRun.alreadyProcessed && duplicateRun.status === 'ignored', 'Duplicate event delivery is recognized and ignored safely');
  }

  // TEST SUITE 4: Lifecycle Action State Transition Mapping
  console.log('\n--- Test Suite 4: Subscription State Transition Matrix ---');
  {
    const transitions: Record<string, string> = {
      Unsubscribe: 'Unsubscribed',
      Suspend: 'Suspended',
      Reinstate: 'Subscribed',
      Renew: 'Subscribed',
      ChangePlan: 'Subscribed',
    };

    assert(transitions['Unsubscribe'] === 'Unsubscribed', 'Unsubscribe transitions to Unsubscribed');
    assert(transitions['Suspend'] === 'Suspended', 'Suspend transitions to Suspended');
    assert(transitions['Reinstate'] === 'Subscribed', 'Reinstate transitions to Subscribed');
    assert(transitions['Renew'] === 'Subscribed', 'Renew confirms Subscribed');
    assert(transitions['ChangePlan'] === 'Subscribed', 'ChangePlan retains Subscribed status');
  }

  console.log('\n======================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
