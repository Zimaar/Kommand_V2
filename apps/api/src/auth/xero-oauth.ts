import { db } from "../db/connection.js";
import { accountingConnections } from "../db/schema.js";
import { encryptToken } from "./encryption.js";
import { config } from "../config.js";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

export function buildXeroAuthUrl(state: string): string {
  const redirectUri = `${config.API_URL}/webhooks/xero/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.XERO_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "offline_access openid profile email accounting.transactions accounting.reports.read accounting.contacts accounting.settings",
    state,
  });

  return `${XERO_AUTH_URL}?${params.toString()}`;
}

export async function exchangeXeroCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const redirectUri = `${config.API_URL}/webhooks/xero/callback`;

  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.XERO_CLIENT_ID}:${config.XERO_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Xero token exchange failed: ${res.status}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function getXeroTenants(accessToken: string): Promise<
  Array<{ tenantId: string; tenantName: string }>
> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {throw new Error(`Failed to fetch Xero tenants: ${res.status}`);}

  const data = await res.json() as Array<{ tenantId: string; tenantName: string }>;
  return data;
}

export async function saveXeroConnection(
  tenantId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  xeroOrgId: string,
  xeroOrgName: string
): Promise<void> {
  const { enc: accessEnc, iv, tag } = encryptToken(accessToken);
  const { enc: refreshEnc } = encryptToken(refreshToken);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await db
    .insert(accountingConnections)
    .values({
      tenantId,
      platform: "xero",
      orgId: xeroOrgId,
      orgName: xeroOrgName,
      accessTokenEnc: accessEnc,
      refreshTokenEnc: refreshEnc,
      tokenIv: iv,
      tokenTag: tag,
      tokenExpiresAt: expiresAt,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [
        accountingConnections.tenantId,
        accountingConnections.platform,
        accountingConnections.orgId,
      ],
      set: {
        accessTokenEnc: accessEnc,
        refreshTokenEnc: refreshEnc,
        tokenIv: iv,
        tokenTag: tag,
        tokenExpiresAt: expiresAt,
        isActive: true,
        updatedAt: new Date(),
      },
    });
}
