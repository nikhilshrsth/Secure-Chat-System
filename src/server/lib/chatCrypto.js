const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getRawKeyMaterial() {
  if (process.env.CHAT_ENCRYPTION_KEY) {
    return process.env.CHAT_ENCRYPTION_KEY;
  }

  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  throw new Error('CHAT_ENCRYPTION_KEY or JWT_SECRET must be configured');
}

function deriveEncryptionKey() {
  const raw = getRawKeyMaterial();

  if (typeof raw === 'string' && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encryptText(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: ALGORITHM,
  };
}

function decryptText({ ciphertext, iv, authTag }) {
  const key = deriveEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(String(iv), 'base64'),
  );

  decipher.setAuthTag(Buffer.from(String(authTag), 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(ciphertext), 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

module.exports = {
  encryptText,
  decryptText,
  ALGORITHM,
};
