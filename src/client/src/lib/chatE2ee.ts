const IDENTITY_STORAGE_KEY = 'secureChatE2EEIdentityV1';

type StoredIdentity = {
  publicKey: string;
  privateKeyJwk: JsonWebKey;
  keyExchangePublicKey: string;
  keyExchangePrivateKeyJwk: JsonWebKey;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function generateIdentity(): Promise<StoredIdentity> {
  const rsaPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );

  const dhPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits'],
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', rsaPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', rsaPair.privateKey);
  const keyExchangePublicKeyBuffer = await crypto.subtle.exportKey('raw', dhPair.publicKey);
  const keyExchangePrivateKeyJwk = await crypto.subtle.exportKey('jwk', dhPair.privateKey);

  return {
    publicKey: bytesToBase64(new Uint8Array(publicKeyBuffer)),
    privateKeyJwk,
    keyExchangePublicKey: bytesToBase64(new Uint8Array(keyExchangePublicKeyBuffer)),
    keyExchangePrivateKeyJwk,
  };
}

async function generateKeyExchangeIdentity(): Promise<Pick<StoredIdentity, 'keyExchangePublicKey' | 'keyExchangePrivateKeyJwk'>> {
  const dhPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits'],
  );

  const keyExchangePublicKeyBuffer = await crypto.subtle.exportKey('raw', dhPair.publicKey);
  const keyExchangePrivateKeyJwk = await crypto.subtle.exportKey('jwk', dhPair.privateKey);

  return {
    keyExchangePublicKey: bytesToBase64(new Uint8Array(keyExchangePublicKeyBuffer)),
    keyExchangePrivateKeyJwk,
  };
}

export async function getOrCreateIdentity(): Promise<StoredIdentity> {
  const rawUser = localStorage.getItem('secureChatUser');
  let userId = '';
  try {
    userId = rawUser ? String(JSON.parse(rawUser)?.id || '') : '';
  } catch (_error) {
    userId = '';
  }
  const storageKey = userId ? `${IDENTITY_STORAGE_KEY}:${userId}` : IDENTITY_STORAGE_KEY;
  const storedRaw = localStorage.getItem(storageKey) || (userId ? localStorage.getItem(IDENTITY_STORAGE_KEY) : null);
  if (storedRaw) {
    try {
      const parsed = JSON.parse(storedRaw) as Partial<StoredIdentity>;
      if (
        parsed.publicKey
        && parsed.privateKeyJwk
        && parsed.keyExchangePublicKey
        && parsed.keyExchangePrivateKeyJwk
      ) {
        localStorage.setItem(storageKey, JSON.stringify(parsed));
        return parsed;
      }

      if (parsed.publicKey && parsed.privateKeyJwk) {
        const keyExchangeIdentity = await generateKeyExchangeIdentity();
        const migrated = {
          publicKey: parsed.publicKey,
          privateKeyJwk: parsed.privateKeyJwk,
          ...keyExchangeIdentity,
        } satisfies StoredIdentity;

        localStorage.setItem(storageKey, JSON.stringify(migrated));
        return migrated;
      }
    } catch (_error) {
      localStorage.removeItem(storageKey);
    }
  }

  const generated = await generateIdentity();
  localStorage.setItem(storageKey, JSON.stringify(generated));
  return generated;
}

async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    base64ToBytes(base64Key),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt'],
  );
}

async function importPrivateKey(privateKeyJwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['decrypt'],
  );
}

async function importKeyExchangePublicKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(base64Key),
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    [],
  );
}

async function importKeyExchangePrivateKey(privateKeyJwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveBits'],
  );
}

async function deriveSharedAesKey(identity: StoredIdentity, peerKeyExchangePublicKey: string): Promise<CryptoKey> {
  const privateKey = await importKeyExchangePrivateKey(identity.keyExchangePrivateKeyJwk);
  const peerPublicKey = await importKeyExchangePublicKey(peerKeyExchangePublicKey);
  const rawBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    privateKey,
    256,
  );

  return crypto.subtle.importKey('raw', rawBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function importThreadKey(rawKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(rawKeyBase64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function generateThreadKeyRaw(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function encryptThreadKeyForUser(
  rawThreadKey: string,
  recipientPublicKey: string,
  recipientKeyExchangePublicKey: string | null,
  identity: StoredIdentity,
): Promise<string> {
  if (recipientKeyExchangePublicKey) {
    const sharedKey = await deriveSharedAesKey(identity, recipientKeyExchangePublicKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      sharedKey,
      base64ToBytes(rawThreadKey),
    );

    const encryptedBytes = new Uint8Array(encrypted);
    const authTag = encryptedBytes.slice(encryptedBytes.length - 16);
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);

    return JSON.stringify({
      scheme: 'ecdh-p256-aes-gcm',
      senderKeyExchangePublicKey: identity.keyExchangePublicKey,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      authTag: bytesToBase64(authTag),
    });
  }

  const publicKey = await importPublicKey(recipientPublicKey);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, base64ToBytes(rawThreadKey));
  return bytesToBase64(new Uint8Array(encrypted));
}

export async function decryptThreadKeyForUser(encryptedThreadKey: string, identity: StoredIdentity): Promise<string> {
  if (encryptedThreadKey.startsWith('{')) {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(encryptedThreadKey);
    } catch {
      throw new Error('Thread key is in an invalid format (JSON parse failed)');
    }

    if (payload?.scheme === 'ecdh-p256-aes-gcm') {
      try {
        const sharedKey = await deriveSharedAesKey(identity, String(payload.senderKeyExchangePublicKey || ''));
        const ciphertext = base64ToBytes(String(payload.ciphertext || ''));
        const authTag = base64ToBytes(String(payload.authTag || ''));
        const combined = new Uint8Array(ciphertext.length + authTag.length);
        combined.set(ciphertext, 0);
        combined.set(authTag, ciphertext.length);

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: base64ToBytes(String(payload.iv || '')), tagLength: 128 },
          sharedKey,
          combined,
        );

        return bytesToBase64(new Uint8Array(decrypted));
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Failed to decrypt thread key (ECDH): ${msg || 'decryption failed — wrong device or stale key'}`);
      }
    }

    throw new Error(`Thread key uses an unsupported scheme: ${String(payload?.scheme ?? 'unknown')}`);
  }

  try {
    const privateKey = await importPrivateKey(identity.privateKeyJwk);
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, base64ToBytes(encryptedThreadKey));
    return bytesToBase64(new Uint8Array(raw));
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to decrypt thread key (RSA): ${msg || 'decryption failed — wrong device or stale key'}`);
  }
}

export async function encryptMessageText(text: string, rawThreadKey: string): Promise<{ ciphertext: string; iv: string; authTag: string; algorithm: string }> {
  const key = await importThreadKey(rawThreadKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);

  const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encoded);
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const authTag = encryptedBytes.slice(encryptedBytes.length - 16);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);

  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    authTag: bytesToBase64(authTag),
    algorithm: 'aes-256-gcm',
  };
}

export async function decryptMessageText(payload: { ciphertext: string; iv: string; authTag: string }, rawThreadKey: string): Promise<string> {
  const key = await importThreadKey(rawThreadKey);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const authTag = base64ToBytes(payload.authTag);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv), tagLength: 128 },
      key,
      combined,
    );
    return new TextDecoder().decode(decrypted);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to decrypt message: ${msg || 'decryption failed'}`);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Multi-device E2EE: passphrase-wrapped identity backup.

   The user picks a passphrase. We derive a 256-bit AES-GCM key from it via
   PBKDF2-SHA-256 with a per-user random salt, then encrypt the JSON identity
   blob. Only ciphertext + KDF params travel to the server — the passphrase
   never leaves the device.
   ────────────────────────────────────────────────────────────────────────── */

const BACKUP_ALGORITHM = 'PBKDF2-SHA256-AES-GCM-256';
const BACKUP_ITERATIONS = 310_000; // OWASP 2023 recommendation for PBKDF2-SHA256

export type EncryptedIdentityBackup = {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
  algorithm: string;
  publicKeyFingerprint?: string | null;
  updatedAt?: string | null;
};

async function deriveBackupKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function fingerprintPublicKey(publicKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(publicKey));
  return bytesToBase64(new Uint8Array(digest)).slice(0, 22);
}

export async function wrapIdentityWithPassphrase(
  identity: StoredIdentity,
  passphrase: string,
): Promise<EncryptedIdentityBackup> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, BACKUP_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(identity));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintext);

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations: BACKUP_ITERATIONS,
    algorithm: BACKUP_ALGORITHM,
    publicKeyFingerprint: await fingerprintPublicKey(identity.publicKey),
  };
}

export async function unwrapIdentityWithPassphrase(
  backup: EncryptedIdentityBackup,
  passphrase: string,
): Promise<StoredIdentity> {
  if (!passphrase) {
    throw new Error('Passphrase is required');
  }
  if (backup.algorithm !== BACKUP_ALGORITHM) {
    throw new Error(`Unsupported backup algorithm: ${backup.algorithm}`);
  }
  const key = await deriveBackupKey(passphrase, base64ToBytes(backup.salt), backup.iterations);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(backup.iv), tagLength: 128 },
      key,
      base64ToBytes(backup.ciphertext),
    );
  } catch {
    throw new Error('Incorrect passphrase, or the backup is corrupted');
  }
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as StoredIdentity;
  if (!parsed.publicKey || !parsed.privateKeyJwk || !parsed.keyExchangePublicKey || !parsed.keyExchangePrivateKeyJwk) {
    throw new Error('Backup is missing required key material');
  }
  return parsed;
}

/**
 * Replace the on-device identity with the one restored from a backup.
 * Used after `unwrapIdentityWithPassphrase` on a new device sign-in.
 */
export function persistIdentity(identity: StoredIdentity): void {
  const rawUser = localStorage.getItem('secureChatUser');
  let userId = '';
  try {
    userId = rawUser ? String(JSON.parse(rawUser)?.id || '') : '';
  } catch {
    userId = '';
  }
  const storageKey = userId ? `${IDENTITY_STORAGE_KEY}:${userId}` : IDENTITY_STORAGE_KEY;
  localStorage.setItem(storageKey, JSON.stringify(identity));
}

/**
 * Wipe the on-device identity. Caller must also call the server-side reset
 * endpoint (`DELETE /api/chat/keys/public`) so the next sign-in can publish
 * a fresh public key.
 */
export function clearLocalIdentity(): void {
  const rawUser = localStorage.getItem('secureChatUser');
  let userId = '';
  try {
    userId = rawUser ? String(JSON.parse(rawUser)?.id || '') : '';
  } catch {
    userId = '';
  }
  if (userId) {
    localStorage.removeItem(`${IDENTITY_STORAGE_KEY}:${userId}`);
  }
  localStorage.removeItem(IDENTITY_STORAGE_KEY);
}

