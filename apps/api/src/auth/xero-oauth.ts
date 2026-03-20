import crypto from "node:crypto";
import { db } from "../db/connection.js";
import { accountingConnections } from "../db/schema.js";
import { encryptToken } from "./encryption.js";
import { config } from "../config.js";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

const XERO_SCOPES =
  "offline_access openid profile email accounting.transactions accounting.reports.read accounting.contacts accounting.settings";

// ─── PKCE ─────────────────────────────────────────────────────────────────────

export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(40).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

// ─── OAuth URL ────────────────────────────────────────────────────────────────

export function buildXeroAuthUrl(state: string, codeChallenge: string): string {
  const redirectUri = `${config.API_URL}/auth/xero/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.XERO_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: XERO_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${XERO_AUTH_URL}?${params.toString()}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export async function exchangeXeroCode(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const redirectUri = `${config.API_URL}/auth/xero/callback`;

  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${config.XERO_CLIENT_ID}:${config.XERO_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xero token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
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

// ─── Tenant connections ───────────────────────────────────────────────────────

export async function getXeroTenants(
  accessToken: string
): Promise<Array<{ tenantId: string; tenantName: string }>> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Xero tenants: ${res.status}`);
  }

  return res.json() as Promise<Array<{ tenantId: string; tenantName: string }>>;
}

// ─── Persist connection ───────────────────────────────────────────────────────

export async function saveXeroConnection(
  tenantId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  xeroOrgId: string,
  xeroOrgName: string
): Promise<void> {
  // Each token gets its own IV — reusing IV with AES-GCM is a security violation.
  const { enc: accessTokenEnc, iv: tokenIv, tag: tokenTag } = encryptToken(accessToken);
  const { enc: refreshTokenEnc, iv: refreshTokenIv, tag: refreshTokenTag } = encryptToken(refreshToken);

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  await db
    .insert(accountingConnections)
    .values({
      tenantId,
      platform: "xero",
      orgId: xeroOrgId,
      orgName: xeroOrgName,
      accessTokenEnc,
      tokenIv,
      tokenTag,
      refreshTokenEnc,
      refreshTokenIv,
      refreshTokenTag,
      tokenExpiresAt,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [
        accountingConnections.tenantId,
        accountingConnections.platform,
        accountingConnections.orgId,
      ],
      set: {
        accessTokenEnc,
        tokenIv,
        tokenTag,
        refreshTokenEnc,
        refreshTokenIv,
        refreshTokenTag,
        tokenExpiresAt,
        isActive: true,
        updatedAt: new Date(),
      },
    });
}
