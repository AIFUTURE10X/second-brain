"use client";

export interface VaultConfig {
  version: number;
  kdf: string;
  kdfSalt: string;
  kdfIterations: number;
  masterKeyNonce: string;
  masterKeyCiphertext: string;
  recoveryKeySalt: string;
  recoveryKeyNonce: string;
  recoveryKeyCiphertext: string;
}

export interface VaultSecret {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  tags: string[];
  updatedAt: string;
}

export interface EncryptedVaultPayload {
  version: number;
  nonce: string;
  ciphertext: string;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const KDF_ITERATIONS = 250_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function normalizeRecoveryKey(value: string): string {
  return value.replace(/[\s-]/g, "").trim();
}

async function importAesKey(raw: BufferSource, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, usages);
}

async function deriveKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(TEXT_ENCODER.encode(secret)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapVaultKey(vaultKey: CryptoKey, wrappingKey: CryptoKey) {
  const rawVaultKey = new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey));
  const nonce = randomBytes(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    wrappingKey,
    toArrayBuffer(rawVaultKey),
  ));
  return { nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(ciphertext) };
}

async function unwrapVaultKey(nonce: string, ciphertext: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(nonce)) },
    wrappingKey,
    toArrayBuffer(base64ToBytes(ciphertext)),
  );
  return importAesKey(raw, ["encrypt", "decrypt"]);
}

export function generateRecoveryKey(): string {
  const compact = base64UrlEncode(randomBytes(32));
  return compact.match(/.{1,4}/g)?.join("-") || compact;
}

export async function createVaultConfig(masterPassword: string): Promise<{ config: VaultConfig; recoveryKey: string; vaultKey: CryptoKey }> {
  const vaultKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const recoveryKey = generateRecoveryKey();
  const kdfSalt = randomBytes(16);
  const recoveryKeySalt = randomBytes(16);
  const masterWrappingKey = await deriveKey(masterPassword, kdfSalt, KDF_ITERATIONS);
  const recoveryWrappingKey = await deriveKey(normalizeRecoveryKey(recoveryKey), recoveryKeySalt, KDF_ITERATIONS);
  const masterWrapped = await wrapVaultKey(vaultKey, masterWrappingKey);
  const recoveryWrapped = await wrapVaultKey(vaultKey, recoveryWrappingKey);

  return {
    vaultKey,
    recoveryKey,
    config: {
      version: 1,
      kdf: "PBKDF2-SHA256",
      kdfSalt: bytesToBase64(kdfSalt),
      kdfIterations: KDF_ITERATIONS,
      masterKeyNonce: masterWrapped.nonce,
      masterKeyCiphertext: masterWrapped.ciphertext,
      recoveryKeySalt: bytesToBase64(recoveryKeySalt),
      recoveryKeyNonce: recoveryWrapped.nonce,
      recoveryKeyCiphertext: recoveryWrapped.ciphertext,
    },
  };
}

export async function unlockVault(config: VaultConfig, masterPassword: string): Promise<CryptoKey> {
  const wrappingKey = await deriveKey(masterPassword, base64ToBytes(config.kdfSalt), config.kdfIterations);
  return unwrapVaultKey(config.masterKeyNonce, config.masterKeyCiphertext, wrappingKey);
}

export async function recoverVault(config: VaultConfig, recoveryKey: string, newMasterPassword: string): Promise<{ config: VaultConfig; vaultKey: CryptoKey }> {
  const recoveryWrappingKey = await deriveKey(
    normalizeRecoveryKey(recoveryKey),
    base64ToBytes(config.recoveryKeySalt),
    config.kdfIterations,
  );
  const vaultKey = await unwrapVaultKey(config.recoveryKeyNonce, config.recoveryKeyCiphertext, recoveryWrappingKey);
  const kdfSalt = randomBytes(16);
  const masterWrappingKey = await deriveKey(newMasterPassword, kdfSalt, KDF_ITERATIONS);
  const masterWrapped = await wrapVaultKey(vaultKey, masterWrappingKey);

  return {
    vaultKey,
    config: {
      ...config,
      version: 1,
      kdfSalt: bytesToBase64(kdfSalt),
      kdfIterations: KDF_ITERATIONS,
      masterKeyNonce: masterWrapped.nonce,
      masterKeyCiphertext: masterWrapped.ciphertext,
    },
  };
}

export async function encryptVaultSecret(vaultKey: CryptoKey, secret: VaultSecret): Promise<EncryptedVaultPayload> {
  const nonce = randomBytes(12);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(secret));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    vaultKey,
    toArrayBuffer(plaintext),
  ));

  return {
    version: 1,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function decryptVaultSecret(vaultKey: CryptoKey, payload: EncryptedVaultPayload): Promise<VaultSecret> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(payload.nonce)) },
    vaultKey,
    toArrayBuffer(base64ToBytes(payload.ciphertext)),
  );
  return JSON.parse(TEXT_DECODER.decode(plaintext)) as VaultSecret;
}

export function makePassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}
