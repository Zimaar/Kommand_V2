import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { accountingConnections } from "../db/schema.js";
import { decryptToken, encryptToken } from "../auth/encryption.js";
import { config } from "../config.js";
import type { PrimitiveResponse } from "@kommand/shared";
import { XeroApiInputSchema } from "@kommand/shared";

const XERO_BASE_URL = "https://api.xero.com/api.xro/2.0";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

async function refreshXeroToken(connectionId: string, refreshToken: string): Promise<string> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.XERO_CLIENT_ID}:${config.XERO_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Xero token refresh failed: ${res.status}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Store the new tokens
  const { enc: accessEnc, iv: accessIv, tag: accessTag } = encryptToken(data.access_token);
  const { enc: refreshEnc, iv: refreshIv, tag: refreshTag } = encryptToken(data.refresh_token);
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await db
    .update(accountingConnections)
    .set({
      accessTokenEnc: accessEnc,
      tokenIv: accessIv,
      tokenTag: accessTag,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(accountingConnections.id, connectionId));

  return data.access_token;
}

export async function xeroApi(
  input: unknown,
  tenantId: string
): Promise<PrimitiveResponse> {
  const parsed = XeroApiInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { method, path, body } = parsed.data;

  const connectionRows = await db
    .select()
    .from(accountingConnections)
    .where(
      and(
        eq(accountingConnections.tenantId, tenantId),
        eq(accountingConnections.platform, "xero"),
        eq(accountingConnections.isActive, true)
      )
    )
    .limit(1);

  const connection = connectionRows[0];
  if (!connection) {
    return { success: false, error: "No Xero account connected. Please connect Xero via the dashboard." };
  }

  let accessToken: string;
  try {
    // Check if token needs refresh (5 min buffer)
    const isExpired =
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
      const refreshToken = decryptToken(
        connection.refreshTokenEnc,
        connection.tokenIv,
        connection.tokenTag
      );
      accessToken = await refreshXeroToken(connection.id, refreshToken);
    } else {
      accessToken = decryptToken(
        connection.accessTokenEnc,
        connection.tokenIv,
        connection.tokenTag
      );
    }
  } catch {
    return { success: false, error: "Failed to authenticate with Xero. Please reconnect your account." };
  }

  try {
    const url = `${XERO_BASE_URL}/${path.startsWith("/") ? path.slice(1) : path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.orgId ?? "",
        Accept: "application/json",
      },
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Xero API error ${res.status}: ${errText.slice(0, 500)}` };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Xero request failed: ${message}` };
  }
}
