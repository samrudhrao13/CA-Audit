import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Envelope encryption for the GST portal username/password we store per client.
 *
 * CREDENTIAL_MASTER_KEY is the "KEK" (key-encryption-key), a plain env var here.
 * In a real deployment this should come from a cloud KMS/secrets manager instead,
 * so the raw key material is never sitting in a .env file long-term. A per-org
 * "DEK" is derived from it via HKDF so a single leaked derived key doesn't expose
 * every org's secrets, and keyVersion leaves room to rotate the master key later.
 */

const KEY_VERSION = 1;

function getMasterKey() {
  const raw = process.env.CREDENTIAL_MASTER_KEY;
  if (!raw) {
    throw new Error("CREDENTIAL_MASTER_KEY is not set");
  }
  const value = raw.startsWith("base64:") ? raw.slice("base64:".length) : raw;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_MASTER_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function deriveOrgKey(orgId) {
  const master = getMasterKey();
  const derived = hkdfSync(
    "sha256",
    master,
    Buffer.from(orgId, "utf8"),
    Buffer.from("automation-credential", "utf8"),
    32
  );
  return Buffer.from(derived);
}

/** Returns { keyVersion, payload } where payload is base64 of iv(12) || authTag(16) || ciphertext. */
export function encryptSecret(plaintext, orgId) {
  const key = deriveOrgKey(orgId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    keyVersion: KEY_VERSION,
    payload: Buffer.concat([iv, authTag, ciphertext]).toString("base64"),
  };
}

export function decryptSecret(encrypted, orgId) {
  const key = deriveOrgKey(orgId);
  const buf = Buffer.from(encrypted.payload, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
