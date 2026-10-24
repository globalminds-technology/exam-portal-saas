import { NextRequest, NextResponse } from 'next/server';

/**
 * AWS Marketplace SaaS Fulfillment Landing Handler
 * AWS Marketplace sends a POST request with Content-Type: application/x-www-form-urlencoded
 * containing parameter: 'x-amzn-marketplace-token'
 */
export async function POST(request: NextRequest) {
  try {
    let token: string | null = null;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      token = (formData.get('x-amzn-marketplace-token') as string) || null;
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      token = body['x-amzn-marketplace-token'] || body.token || null;
    }

    if (!token) {
      const url = new URL('/marketplace/aws/activate?error=missing_token', request.url);
      return NextResponse.redirect(url, 303);
    }

    const redirectUrl = new URL(
      `/marketplace/aws/activate?token=${encodeURIComponent(token)}`,
      request.url
    );
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    console.error('AWS Marketplace landing POST error:', error);
    const errorUrl = new URL('/marketplace/aws/activate?error=server_error', request.url);
    return NextResponse.redirect(errorUrl, 303);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('x-amzn-marketplace-token') || searchParams.get('token');

  if (token) {
    const redirectUrl = new URL(
      `/marketplace/aws/activate?token=${encodeURIComponent(token)}`,
      request.url
    );
    return NextResponse.redirect(redirectUrl, 302);
  }

  const activateUrl = new URL('/marketplace/aws/activate', request.url);
  return NextResponse.redirect(activateUrl, 302);
}
