/**
 * Live AWS Marketplace Entitlement Service Verification Tool
 *
 * This script makes a live, authenticated call to AWS Marketplace Entitlements Service
 * using your configured AWS credentials and ProductCode.
 *
 * Running this script records an authoritative GetEntitlements call in AWS telemetry,
 * satisfying the requirement to resolve the AUDIT_ERROR for Public Visibility.
 *
 * Usage:
 *   npx tsx scripts/verify-aws-entitlements-live.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { awsMarketplaceClient } from '../src/lib/marketplace/aws/client';

function maskString(str?: string): string {
  if (!str) return '[NOT SET]';
  if (str.length <= 6) return '***';
  return str.slice(0, 4) + '...' + str.slice(-2);
}

async function verifyLiveEntitlements() {
  console.log('\n======================================================');
  console.log('📡 AWS MARKETPLACE LIVE ENTITLEMENT VERIFICATION');
  console.log('======================================================\n');

  const productCode = process.env.AWS_MARKETPLACE_PRODUCT_CODE;
  const accessKeyId = process.env.AWS_MARKETPLACE_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_MARKETPLACE_SECRET_ACCESS_KEY;
  const region = process.env.AWS_MARKETPLACE_REGION || 'us-east-1';

  console.log('Configured Environment:');
  console.log(`  Product Code : ${productCode || '[NOT CONFIGURED]'}`);
  console.log(`  Access Key ID: ${maskString(accessKeyId)}`);
  console.log(`  Secret Key   : ${secretKey ? '[CONFIGURED]' : '[NOT CONFIGURED]'}`);
  console.log(`  AWS Region   : ${region} (Entitlements Service is in us-east-1)\n`);

  if (!productCode) {
    console.error('❌ Error: AWS_MARKETPLACE_PRODUCT_CODE is missing in .env');
    process.exit(1);
  }

  if (!accessKeyId || !secretKey) {
    console.error('❌ Error: AWS credentials (AWS_MARKETPLACE_ACCESS_KEY_ID / SECRET) missing in .env');
    process.exit(1);
  }

  console.log(`⏳ Invoking GetEntitlementsCommand for product code: ${productCode}...`);

  try {
    const startTime = Date.now();
    const entitlements = await awsMarketplaceClient.getEntitlements({
      productCode,
    });
    const elapsed = Date.now() - startTime;

    console.log(`\n✔ HTTP Call Successful (${elapsed}ms)`);
    console.log(`✔ AWS Marketplace Entitlements Service registered the API request!`);
    console.log(`  Total active entitlements returned: ${entitlements.length}`);

    if (entitlements.length > 0) {
      console.log('  Active Entitlements:');
      entitlements.forEach((item, idx) => {
        console.log(`    [${idx + 1}] Dimension: ${item.dimension}, Value: ${JSON.stringify(item.value)}, Expiration: ${item.expirationDate?.toISOString() || 'N/A'}`);
      });
    } else {
      console.log('  Note: 0 active buyer entitlements currently found for this product.');
      console.log('  This is normal before buyers purchase in production, and proves');
      console.log('  the GetEntitlements endpoint was called and processed by AWS.');
    }

    console.log('\n======================================================');
    console.log('🎉 AUDIT_ERROR PRE-CONDITION MET: GetEntitlements invoked successfully!');
    console.log('======================================================\n');
  } catch (err: unknown) {
    console.error('\n❌ GetEntitlements Call Failed:');
    if (err instanceof Error) {
      console.error(`   Message: ${err.message}`);
    } else {
      console.error('   Unknown error:', err);
    }
    console.error('\nPlease check your AWS IAM permissions and credentials in .env.');
    process.exit(1);
  }
}

verifyLiveEntitlements();

