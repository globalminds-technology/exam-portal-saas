import { NextResponse } from 'next/server';

/**
 * Legacy Amazon SNS Webhook Endpoint (Deprecated)
 * Note: For sellers registered after July 15, 2026, AWS Marketplace publishes
 * lifecycle notifications through Amazon EventBridge (aws.agreement-marketplace)
 * rather than Amazon SNS.
 * Active endpoint: /api/marketplace/aws/eventbridge
 */
export async function POST() {
  return NextResponse.json(
    {
      deprecated: true,
      message:
        'AWS Marketplace SNS notifications are replaced by Amazon EventBridge (aws.agreement-marketplace) for post-July 15, 2026 sellers. Use /api/marketplace/aws/eventbridge.',
    },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      deprecated: true,
      message: 'Use /api/marketplace/aws/eventbridge for Amazon EventBridge integration.',
    },
    { status: 200 }
  );
}
