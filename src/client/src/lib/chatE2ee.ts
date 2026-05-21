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
    try {
      const payload = JSON.parse(encryptedThreadKey);
      if (payload?.scheme === 'ecdh-p256-aes-gcm' && payload?.senderKeyExchangePublicKey) {
        const sharedKey = await deriveSharedAesKey(identity, String(payload.senderKeyExchangePublicKey));
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
      }
    } catch (_error) {
      // Fall back to legacy RSA decryption for backward compatibility.
    }
  }

  const privateKey = await importPrivateKey(identity.privateKeyJwk);
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, base64ToBytes(encryptedThreadKey));
  return bytesToBase64(new Uint8Array(raw));
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

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv), tagLength: 128 },
    key,
    combined,
  );

  return new TextDecoder().decode(decrypted);
}
