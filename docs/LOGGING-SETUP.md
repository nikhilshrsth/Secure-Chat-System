# Logging System Implementation Guide

## Overview

The Secure Chat System now has a comprehensive, project-specific logging system that tracks encryption operations, authentication attempts, 2FA events, real-time chat anomalies, and security threats.

## Files Created/Modified

### New Files
1. **[docs/logging-system.md](logging-system.md)** - Comprehensive logging documentation
2. **[src/server/services/logger.js](../src/server/services/logger.js)** - Core Logger service
3. **[src/server/sockets/loggerHandler.js](../src/server/sockets/loggerHandler.js)** - Socket.IO logging
4. **[src/server/routes/adminRoutes.js](../src/server/routes/adminRoutes.js)** - Admin log retrieval endpoints
5. **[src/server/middleware/loggerMiddleware.js](../src/server/middleware/loggerMiddleware.js)** - HTTP request logging

### Modified Files
1. **[src/server/models/SecurityLog.js](../src/server/models/SecurityLog.js)** - Extended schema with 25+ fields
2. **[src/server/app.js](../src/server/app.js)** - Added logging middleware and admin routes
3. **[src/server/routes/authRoutes.js](../src/server/routes/authRoutes.js)** - Added logging to auth endpoints
4. **[src/server/middleware/errorMiddleware.js](../src/server/middleware/errorMiddleware.js)** - Added error logging

## Quick Start

### 1. Import the Logger Service

```javascript
const Logger = require('../services/logger');
```

### 2. Log Authentication Events

```javascript
// Successful login
await Logger.logAuthAttempt(userId, ipAddress, userAgent, true, 'Login successful', 'INFO');

// Failed login
await Logger.logAuthAttempt(userId, ipAddress, userAgent, false, 'Invalid credentials', 'WARN');

// Registration
await Logger.logRegistration(userId, ipAddress, userAgent, true, 'User registered', 'INFO');
```

### 3. Log 2FA Events

```javascript
// 2FA verification success
await Logger.log2FA(userId, ipAddress, userAgent, 'twoFAVerificationSuccess', true, 'TOTP verified');

// Multiple failed attempts (anomaly)
await Logger.log2FAAnomaly(userId, ipAddress, userAgent, 5, 'CRITICAL');
```

### 4. Log Socket Events

```javascript
const SocketLogger = require('../sockets/loggerHandler');

// Socket connection
await SocketLogger.logSocketConnect(socket, user, ipAddress, userAgent);

// Room joined
await SocketLogger.logRoomJoin(socket, user, roomId, true);

// Encryption failure
await SocketLogger.logEncryptionFailure(userId, messageId, 'invalid_key');

// Message tampering detected
await SocketLogger.logTamperingDetected(userId, messageId, 'AES-GCM tag mismatch');
```

### 5. Log Encryption Operations

```javascript
// Key generation
await Logger.logKeyOperation(userId, 'generate', true, 'ECDH key pair generated', 'ECDH');

// Key rotation
await Logger.logKeyOperation(userId, 'rotate', true, 'User rotated encryption key', 'ECDH');

// Encryption success
await Logger.logEncryption(userId, 'messageEncrypted', true, 'Message encrypted with AES-GCM');

// Decryption failure with anomaly detection
await SocketLogger.logDecryptionFailure(userId, messageId, 'corrupted_iv');
```

## Admin API Endpoints

All endpoints require admin role authentication.

### Get Security Logs
```http
GET /api/admin/logs?limit=50&skip=0&eventType=loginFailed&severity=WARN&userId=123
```

### Get User Logs
```http
GET /api/admin/logs/user/:userId?limit=50
```

### Get Critical Events
```http
GET /api/admin/logs/critical?hours=24
```

### Detect Anomalies
```http
GET /api/admin/logs/anomalies
```
Returns:
- Multiple failed logins in last hour (≥5 attempts)
- Multiple failed 2FA in last 5 minutes (≥3 attempts)
- Multiple decryption failures in last 24 hours (≥5 failures)
- Possible MITM attacks (≥2 key mismatches in 1 hour)

### Get Failed Login Attempts
```http
GET /api/admin/logs/failed-logins/:userId?hours=24
```

### Get 2FA Failures
```http
GET /api/admin/logs/2fa-failures/:userId?hours=24
```

### Get Encryption/Decryption Failures
```http
GET /api/admin/logs/encryption-failures?hours=24
```

### Get Message Tampering Events
```http
GET /api/admin/logs/tampering?hours=24
```

### Export Logs
```http
GET /api/admin/logs/export?eventType=decryptionFailed&severity=CRITICAL&startDate=2026-05-01&endDate=2026-05-12
```

### Get Log Statistics
```http
GET /api/admin/logs/stats?hours=24
```
Returns summary counts for:
- Total logs
- Critical logs
- Warning logs
- Failed logins
- Failed 2FA
- Decryption failures
- Encryption failures
- Tampering events

## Security Event Types

### Authentication Events
- `loginSuccess` - Successful login
- `loginFailed` - Failed login attempt
- `userRegistration` - User registration
- `bruteForceLoginDetected` - Multiple failed attempts (CRITICAL)

### 2FA Events
- `twoFASetupInitiated` - User enables 2FA
- `twoFASecretGenerated` - TOTP secret created
- `twoFAVerificationSuccess` - TOTP code accepted
- `twoFAVerificationFailed` - Wrong TOTP code
- `multipleFailedTwoFAAttempts` - >3 attempts in 5 minutes (CRITICAL)
- `twoFADisabled` - User disables 2FA

### Encryption & Key Events
- `publicKeyUploaded` - User uploads ECDH public key
- `publicKeyRotated` - User rotates encryption key
- `encryptionFailed` - Message encryption failed
- `decryptionFailed` - Message decryption failed
- `keyMismatchDetected` - Recipient key mismatch (CRITICAL - possible MITM)
- `messageContentTampered` - AES-GCM tag validation failed (CRITICAL)

### Socket & Chat Events
- `socketConnected` - WebSocket connection established
- `socketAuthenticated` - Socket JWT verified
- `socketDisconnected` - WebSocket closed
- `roomJoined` - User joined chat room
- `roomLeft` - User left chat room
- `messageSent` - Message transmitted
- `messageDelivered` - Message stored
- `messageReadBy` - Recipient opened message

### Unauthorized Access
- `unauthorizedRoomAccess` - Attempt to join unauthorized room
- `unauthorizedMessageRead` - Attempt to read other's message
- `unauthorizedGroupAccess` - Attempt to join private group

### Admin Actions
- `adminViewedSecurityLogs` - Admin accessed logs
- `adminDisabledUser` - Admin disabled user
- `adminEnabledUser` - Admin enabled user
- `adminForcedUserLogout` - Admin terminated session

## Severity Levels

- **INFO** - Normal operations (successful login, message sent)
- **WARN** - Unusual but handled (failed login, inactivity, integrity check)
- **CRITICAL** - Security threats (tampering, MITM, multiple failures)

## Anomaly Detection

The system automatically detects:
1. **Brute Force Attacks** - >5 failed logins in 1 hour
2. **2FA Bypass Attempts** - >3 failed 2FA attempts in 5 minutes
3. **Decryption Failures** - >5 failed decryptions in 24 hours
4. **Man-in-the-Middle** - >2 key mismatches in 1 hour

Access detected anomalies via: `GET /api/admin/logs/anomalies`

## Database Indexes

Logs are automatically indexed on:
- `userId` + `createdAt` (user activity timeline)
- `eventType` + `createdAt` (event timeline)
- `severity` + `createdAt` (critical events)
- `createdAt` (TTL index: auto-delete after 90 days)

## Querying Examples

### Get all CRITICAL events in last 24 hours
```javascript
const result = await Logger.getCriticalEvents(24);
```

### Get failed login attempts for user in last hour
```javascript
const result = await Logger.getFailedLoginAttempts(userId, 1);
```

### Detect security anomalies
```javascript
const anomalies = await Logger.detectAnomalies();
// Returns:
// {
//   multipleFailedLogins: [{ _id: userId, count: 7 }, ...],
//   multipleFailedTwoFA: [{ _id: userId, count: 4 }, ...],
//   multipleDecryptionFailures: [{ _id: userId, count: 8 }, ...],
//   possibleMITM: [{ _id: userId, count: 3 }, ...]
// }
```

### Custom query with filters
```javascript
const result = await Logger.queryLogs(
  {
    userId: ObjectId('...'),
    eventType: 'decryptionFailed',
    severity: 'CRITICAL',
    createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
  },
  limit = 100,
  skip = 0
);
```

## Implementation Checklist

When implementing logging in socket handlers:

- [ ] Import `SocketLogger` from `../sockets/loggerHandler.js`
- [ ] Log socket connection/authentication
- [ ] Log room access (authorized/unauthorized)
- [ ] Log message sent/delivered
- [ ] Log encryption/decryption success and failures
- [ ] Log key operations and mismatches
- [ ] Log tampering detection
- [ ] Handle logging errors gracefully (never break request flow)

## Best Practices

1. **Never Log Sensitive Data**
   - ❌ Don't log passwords, TOTP secrets, or private keys
   - ✅ Do log IP addresses (helpful for attack detection)
   - ✅ Do log user IDs and room IDs
   - ✅ Do log error reasons without details

2. **Always Await Logging**
   ```javascript
   // Good - fire and forget (won't block request)
   await Logger.log({...}).catch(err => console.error(err));
   
   // Or use async IIFE for background logging
   (async () => {
     await Logger.log({...});
   })().catch(err => console.error(err));
   ```

3. **Determine Context Early**
   - Extract IP address and user agent at middleware level
   - Attach to `req.logContext` for all handlers

4. **Categorize Events Properly**
   - Use specific `eventType` values from documentation
   - Set `severity` based on security impact
   - Include `failureReason` for debugging

5. **Monitor Critical Events**
   - Review `/api/admin/logs/critical` daily
   - Run `/api/admin/logs/anomalies` regularly
   - Set alerts for CRITICAL severity logs

## Troubleshooting

### Logs not being created?
1. Check MongoDB connection is active
2. Verify `SecurityLog` model is imported correctly
3. Check for console errors in `Logger.log()` calls
4. Ensure logging calls have `await`

### Query returning no results?
1. Verify filter syntax (case-sensitive for strings)
2. Check date range is correct
3. Use `limit: 1000` to see all matching documents
4. Check logs exist with: `GET /api/admin/logs?limit=1`

### Performance issues?
1. Ensure indexes are created (check MongoDB admin)
2. Use pagination (limit + skip) for large result sets
3. Filter by date range to reduce scan time
4. Archive logs older than 90 days (TTL index handles this)

## Next Steps

1. Implement logging in remaining socket event handlers
2. Create frontend dashboard for viewing logs
3. Set up automated alerts for critical events
4. Configure log archival and retention policies
5. Add log encryption for compliance

