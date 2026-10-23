/**
 * Azure Active Directory (Microsoft Entra ID) OAuth Token Acquisition
 * Authenticates against Azure Marketplace SaaS Fulfillment Resource: 20e940b3-4c77-4b0b-9a53-9e16a1b010a7
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // unix timestamp in milliseconds
}

let cachedToken: CachedToken | null = null;

export async function getMarketplaceAccessToken(): Promise<string> {
  const tenantId = process.env.MARKETPLACE_TENANT_ID;
  const clientId = process.env.MARKETPLACE_CLIENT_ID;
  const clientSecret = process.env.MARKETPLACE_CLIENT_SECRET;
  const resource = process.env.MARKETPLACE_RESOURCE_ID || '20e940b3-4c77-4b0b-9a53-9e16a1b010a7';

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing required Microsoft Azure Marketplace credentials in environment variables (MARKETPLACE_TENANT_ID, MARKETPLACE_CLIENT_ID, MARKETPLACE_CLIENT_SECRET).'
    );
  }

  // Return cached token if valid (with 5-minute safety buffer)
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 300000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    resource: resource,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to acquire Azure AD access token for Marketplace:', response.status, errorBody);
    throw new Error(`Azure AD token acquisition failed: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: string | number;
    token_type: string;
  };

  const expiresInSeconds = typeof data.expires_in === 'string' ? parseInt(data.expires_in, 10) : data.expires_in;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  };

  return cachedToken.accessToken;
}
