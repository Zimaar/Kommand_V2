import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { accountingConnections } from "../db/schema.js";
import { encryptToken, decryptToken } from "./encryption.js";
import { redis } from "../lib/redis.js";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

// Refresh if the token expires within 5 minutes
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
// Redis lock TTL — long enough for a refresh round-trip, short enough to self-heal
const LOCK_TTL_SECONDS = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

type XeroConnection = {
  id: string;
  accessTokenEnc: string;
  tokenIv: string;
  tokenTag: string;
  refreshTokenEnc: string;
  refreshTokenIv: string;
  refreshTokenTag: string;
  tokenExpiresAt: Date | null;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a valid Xero access token for the given tenant.
 * If the token expires within 5 minutes, it is refreshed first.
 * Uses a Redis lock to prevent concurrent refresh races.
 *
 * Throws if no Xero connection exists for the tenant.
 */
export async function getValidXeroToken(tenantId: string): Promise<string> {
  const conn = await loadConnection(tenantId);
  if (!conn) {
    throw new Error(`No active Xero connection for tenant ${tenantId}`);
  }

  const expiresAt = conn.tokenExpiresAt?.getTime() ?? 0;
  if (Date.now() < expiresAt - REFRESH_THRESHOLD_MS) {
    // Token is still fresh — decrypt and return directly
    return decryptToken(conn.accessTokenEnc, conn.tokenIv, conn.tokenTag);
  }

  return refreshWithLock(tenantId, conn);
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function loadConnection(tenantId: string): Promise<XeroConnection | null> {
  const rows = await db
    .select({
      id: accountingConnections.id,
      accessTokenEnc: accountingConnections.accessTokenEnc,
      tokenIv: accountingConnections.tokenIv,
      tokenTag: accountingConnections.tokenTag,
      refreshTokenEnc: accountingConnections.refreshTokenEnc,
      refreshTokenIv: accountingConnections.refreshTokenIv,
      refreshTokenTag: accountingConnections.refreshTokenTag,
      tokenExpiresAt: accountingConnections.tokenExpiresAt,
    })
    .from(accountingConnections)
    .where(
      and(
        eq(accountingConnections.tenantId, tenantId),
        eq(accountingConnections.platform, "xero"),
        eq(accountingConnections.isActive, true)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

async function refreshWithLock(tenantId: string, conn: XeroConnection): Promise<string> {
  const lockKey = `xero:refresh:lock:${tenantId}`;

  // Atomic NX + EX — only one process wins the lock (ioredis: EX before NX)
  const acquired = await redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");

  if (!acquired) {
    // Another process is refreshing — wait briefly, then re-read from DB
    await new Promise((resolve) => setTimeout(resolve, 700));
    const fresh = await loadConnection(tenantId);
    if (!fresh) {
      throw new Error(`Xero connection disappeared during refresh for tenant ${tenantId}`);
    }
    return decryptToken(fresh.accessTokenEnc, fresh.tokenIv, fresh.tokenTag);
  }

  try {
    const refreshToken = decryptToken(
      conn.refreshTokenEnc,
      conn.refreshTokenIv,
      conn.refreshTokenTag
    );

    const { accessToken, newRefreshToken, expiresIn } = await callXeroRefresh(refreshToken);

    await persistRefreshedTokens(conn.id, tenantId, accessToken, newRefreshToken, expiresIn);

    return accessToken;
  } finally {
    await redis.del(lockKey);
  }
}

async function callXeroRefresh(refreshToken: string): Promise<{
  accessToken: string;
  newRefreshToken: string;
  expiresIn: number;
}> {
  // Client credentials come from env — safe to import lazily to avoid circular deps
  const { config } = await import("../config.js");

  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${config.XERO_CLIENT_ID}:${config.XERO_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xero token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    newRefreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

async function persistRefreshedTokens(
  connectionId: string,
  tenantId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const { enc: accessTokenEnc, iv: tokenIv, tag: tokenTag } = encryptToken(accessToken);
  const { enc: refreshTokenEnc, iv: refreshTokenIv, tag: refreshTokenTag } = encryptToken(refreshToken);
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  await db
    .update(accountingConnections)
    .set({
      accessTokenEnc,
      tokenIv,
      tokenTag,
      refreshTokenEnc,
      refreshTokenIv,
      refreshTokenTag,
      tokenExpiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(accountingConnections.id, connectionId),
        eq(accountingConnections.tenantId, tenantId)
      )
    );
}
