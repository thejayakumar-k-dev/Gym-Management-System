/**
 * AES-256-GCM encryption for vendor Neon credentials.
 *
 * Encrypts sensitive data (database URLs, API keys, auth secrets)
 * before storing in the central database. Decrypts at runtime only.
 *
 * Uses Node.js built-in crypto module — no external dependencies.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits

function getKey(): Buffer {
  const hexKey = process.env.VENDOR_CONFIG_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length < 64) {
    throw new Error(
      "VENDOR_CONFIG_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64 string produced by encrypt().
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const packed = Buffer.from(encryptedBase64, "base64");

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Check if a string looks like it's already encrypted (base64, min length).
 * Useful for migration: don't double-encrypt.
 */
export function isEncrypted(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    // Encrypted data: 12 (iv) + 16 (tag) + at least 1 byte = 29 bytes min
    return buf.length >= 29 && buf.toString("base64") === value;
  } catch {
    return false;
  }
}
