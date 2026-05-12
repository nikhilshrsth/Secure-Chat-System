# Security Logging System Documentation

## Overview

The Secure Chat System implements a comprehensive, project-specific logging system designed to detect encryption failures, key management issues, 2FA abuse, message tampering, and real-time chat anomalies.

---

## Event Categories

### 1. Encryption & Cryptography Events

Track client-side and server-side encryption operations:

- `publicKeyUploaded` - User uploads ECDH public key
- `publicKeyRotated` - User rotates their encryption key
- `encryptionFailed` - Message encryption failed before sending
- `decryptionFailed` - Failed to decrypt received message (tampering indicator)
- `keyMismatchDetected` - Recipient's key doesn't match sender's expectation
- `ecdhExchangeInitiated` - ECDH key agreement started
- `ivValidationFailed` - Invalid Initialization Vector on message

### 2. End-to-End Message Security Events

Monitor message integrity and encryption throughout the chat:

- `messageEncrypted` - Message successfully encrypted before sending
- `messageDecrypted` - Message successfully decrypted on receipt
- `messageIntegrityCheckFailed` - AES-GCM tag validation failed (tampering detected)
- `messageExpired` - Ephemeral message reached expiresAt date
- `messageContentTampered` - Ciphertext altered (detected via HMAC/tag)
- `ciphertextCorruption` - Malformed ciphertext or missing IV/tag
- `messageReadReceiptSent` - Recipient opened message

### 3. Two-Factor Authentication (TOTP-Specific)

Detect and prevent 2FA bypass attempts:

- `twoFASetupInitiated` - User clicks "Enable 2FA"
- `twoFASecretGenerated` - TOTP secret created
- `twoFAQRCodeGenerated` - QR code shown to user
- `twoFAVerificationAttempt` - User submits TOTP code
- `twoFAVerificationSuccess` - TOTP code accepted
- `twoFAVerificationFailed` - Wrong TOTP code
- `multipleFailedTwoFAAttempts` - >3 failed attempts in 5 minutes (THREAT)
- `twoFADisabled` - User turns off 2FA
- `backupCodeGenerated` - Emergency codes created
- `backupCodeUsed` - One-time backup code consumed

### 4. Real-Time Socket.IO Events

Track WebSocket connections and room management:

- `socketConnected` - User establishes WebSocket connection
- `socketAuthenticated` - Socket JWT verified successfully
- `socketAuthenticationFailed` - Socket JWT invalid/expired
- `roomJoined` - User joins chat room
- `roomLeft` - User leaves chat room
- `socketDisconnected` - WebSocket closed (expected)
- `reconnectAttempt` - Client tries to reconnect after disconnect
- `unexpectedDisconnection` - Abrupt socket closure (possible attack)

### 5. Message & Chat Context

Log chat operations with room and participant context:

- `messageSent` - Message queued for sending
- `messageDelivered` - Server received and stored encrypted message
- `messageReadBy` - Recipient opened message
- `groupMessageBroadcast` - Message sent to group room
- `oneToOneMessageSent` - Private message sent between users
- `messageHistoryRequested` - User queries old messages
- `typingIndicatorSent` - User typing notification

### 6. Authorization & Access Control

Detect unauthorized access attempts:

- `unauthorizedRoomAccess` - User tried to join room they're not in
- `unauthorizedMessageRead` - User tried to read message not addressed to them
- `unauthorizedMessageDelete` - Non-sender tried to delete message
- `unauthorizedGroupAccess` - User tried to join private group
- `adminUserDisabledAlert` - Admin disabled user in active room
- `deletedUserMessageAttempt` - Attempt involving deleted user

### 7. Key Anomalies & Security Threats

Detect potential attacks and breaches:

- `multipleDecryptionFailures` - >5 failed decryptions from same user (THREAT)
- `possibleManInTheMiddleAttack` - Key mismatch in multiple messages (THREAT)
- `messageTamperingDetected` - Failed integrity checks on encrypted content
- `keyRotationAnomaly` - Unexpected/frequent key changes from one user
- `brokenCryptoPractice` - Missing encryption on message that should be encrypted

### 8. Real-Time Chat Presence

Monitor user availability and activity:

- `userOnlineStatusChanged` - User connected/disconnected
- `presenceUpdatedInRoom` - User's status broadcast to room
- `inactivityTimeout` - User idle >15 minutes
- `userStatusManuallyChanged` - User set status to away/DND

### 9. Admin Actions on Security

Audit all administrative security operations:

- `adminDisabledUser` - Admin deactivated user account
- `adminEnabledUser` - Admin reactivated user account
- `adminViewedSecurityLogs` - Audit trail of admin viewing logs
- `adminForcedUserLogout` - Admin terminated active sessions
- `suspiciousActivityReported` - Admin flagged user for review

### 10. Encryption Field Validation

Detect data corruption:

- `missingIV` - Message ciphertext missing IV field
- `missingCiphertext` - Message row empty/corrupted
- `invalidCiphertextFormat` - Ciphertext not base64/invalid encoding
- `cryptoAPIError` - Browser Crypto API failed on client

---

## Severity Levels

Logs are classified by severity to help prioritize security monitoring:

- **INFO** - Normal operations (login, message sent, room joined)
- **WARN** - Unusual but handled events (failed login attempt, inactivity timeout)
- **CRITICAL** - Security threats requiring immediate attention (multiple decryption failures, tampering detected, multiple failed 2FA)

---

## SecurityLog Schema

```javascript
{
  // Core identification
  _id: ObjectId,
  eventType: String,           // Required: event category (e.g., 'twoFAVerificationFailed')
  userId: ObjectId,            // Who triggered the event
  targetUserId: ObjectId,      // Who is affected (optional)
  ipAddress: String,           // Requester IP
  userAgent: String,           // Browser/client info
  
  // Contextual relationships
  roomId: String,              // Chat room context (optional)
  messageId: ObjectId,         // Associated message (optional)
  
  // Classification
  severity: String,            // 'INFO', 'WARN', 'CRITICAL'
  success: Boolean,            // Did operation succeed?
  details: String,             // Human-readable description (max 500 chars)
  
  // Crypto-specific fields
  encryptionAlgorithm: String, // 'AES-GCM', 'ECDH', etc (optional)
  keyOperationType: String,    // 'generate', 'rotate', 'exchange' (optional)
  failureReason: String,       // 'wrong_key', 'corrupted_iv', 'tampered' (optional)
  
  // Pattern detection for abuse
  attemptCount: Number,        // For repeated failures (2FA, decryption)
  timeSinceLastAttempt: Number, // milliseconds since previous similar event
  
  // Socket/connectivity fields
  socketEventType: String,     // 'connect', 'disconnect', 'error' (optional)
  connectionDuration: Number,  // milliseconds (optional)
  
  // Timestamps
  createdAt: Date,             // When log was written
  eventTime: Date,             // When event occurred (for order of events)
}
```

---

## Implementation Notes

### When to Log Events

1. **Always log** 2FA attempts, authorization failures, and key operations
2. **Log success cases** for encryption, message delivery, and socket auth
3. **Log anomalies** (repeated failures, unexpected patterns)
4. **Log admin actions** for audit trail
5. **Log security threats** immediately with CRITICAL severity

### Sensitive Data Handling

- **Never log** plaintext passwords, TOTP secrets, or private keys
- **Log IP addresses** for geolocation analysis (helpful for detecting compromised accounts)
- **Log user IDs** and room IDs for context (not sensitive)
- **Log error reasons** (e.g., "wrong_totp_code") but not the actual codes

### Performance Considerations

- Log writes are asynchronous to avoid blocking request handlers
- Use indexing on frequently queried fields: `userId`, `eventType`, `createdAt`, `severity`
- Archive logs older than 90 days to manage database size
- Implement log pagination for admin views

### Query Examples

```javascript
// Find all 2FA failures for a user in last 24 hours
db.collection('securitylogs').find({
  userId: ObjectId('...'),
  eventType: /twoFA/,
  success: false,
  createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
})

// Detect possible man-in-the-middle attacks
db.collection('securitylogs').find({
  eventType: 'keyMismatchDetected',
  severity: 'CRITICAL',
  createdAt: { $gte: new Date(Date.now() - 60*60*1000) }
})

// Find all decryption failures for pattern analysis
db.collection('securitylogs').find({
  eventType: 'decryptionFailed',
  createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
}).sort({ createdAt: -1 })
```

---

## Related Files

- [SecurityLog Model](../src/server/models/SecurityLog.js)
- [Logger Service](../src/server/services/logger.js)
- [HTTP Logging Middleware](../src/server/middleware/loggerMiddleware.js)
- [Authentication Routes](../src/server/routes/authRoutes.js)
- [Socket Logging Handler](../src/server/sockets/loggerHandler.js)

