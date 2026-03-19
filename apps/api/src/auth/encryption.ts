import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env["ENCRYPTION_KEY"];
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

export function encryptToken(plaintext: string): {
  enc: string;
  iv: string;
  tag: string;
} {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    enc: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptToken(enc: string, iv: string, tag: string): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
