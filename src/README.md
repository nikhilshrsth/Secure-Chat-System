# Shadow Link Secure Chat System

> A secure real-time chat application built for ICT932 Cybersecurity Testing and Assurance.

**Unit:** ICT932 - Cybersecurity Testing and Assurance  
**Course:** Master of Information Technology (MIT)  
**Semester:** S1-2026  
**Assessment:** Assessment 3 - Cybersecurity Project Implementation  
**Project option:** Project 6 - Secure Chat Application

---

## Project Overview

Shadow Link is a MERN-style secure messaging prototype that demonstrates authentication, account verification, role-based access control, client-side encrypted chat, user profile management, and security monitoring.

The current implementation includes a React/Vite frontend, an Express/MongoDB backend, Socket.IO real-time messaging, JWT-protected API routes, email OTP registration verification, optional authenticator-app MFA, customer and admin workspaces, and metadata-focused security logging.

This project is designed for academic demonstration and security testing. It should not be used for real private communication without further production hardening and independent security review.

---

## Key Features

### Customer Features

- Customer registration with email OTP verification.
- Email/password login with bcrypt password hashing.
- Optional TOTP MFA using an authenticator app.
- JWT-authenticated customer workspace.
- Profile management for date of birth, alternative email, country, language, theme preference, and profile picture.
- Light and dark theme preference.
- Customer dashboard showing active threads and request counts.
- End-to-end encrypted direct chat workflow.
- First-contact chat request flow by recipient email.
- Incoming request accept/reject handling.
- Outgoing request status tracking.
- Real-time message delivery with Socket.IO.
- REST fallback for message sending when the socket is unavailable.
- One-level message replies.

### Admin Features

- Admin-only dashboard.
- Customer account list with search.
- Customer activation and suspension.
- Login attempt monitoring.
- Security log viewing and export.
- Critical/anomaly log views.
- Suspicious alert review, status updates, notes, and user suspension from alerts.
- Chat thread metadata review.
- Message integrity metadata review.
- Ephemeral message metadata review.
- Admin audit trail.
- DevSecOps scan status view backed by stored scan metadata.

### Security Features

- Password hashing with bcrypt.
- JWT access control for API routes and Socket.IO connections.
- Role-based authorization for admin routes.
- Email OTP verification during registration.
- Optional TOTP MFA for login.
- Google ID token verification endpoint for Google sign-in.
- Helmet security headers.
- CORS restricted to the configured frontend origin.
- API rate limiting.
- Zod validation for profile payloads.
- Multer file size and extension checks for profile pictures.
- Client-side RSA-OAEP identity keys.
- Per-thread AES-GCM message keys wrapped for each participant.
- AES-GCM encrypted message payloads stored in MongoDB.
- AES-GCM authentication tag storage for integrity verification.
- Server-side checks that encrypted payloads include ciphertext, IV, auth tag, and supported algorithm metadata.
- Security, admin, encryption, message integrity, and suspicious activity logs.

---

## Technology Stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 7 |
| Frontend API | Axios, Socket.IO Client |
| Frontend crypto | Web Crypto API, RSA-OAEP, AES-GCM |
| Backend | Node.js, Express 5 |
| Database | MongoDB, Mongoose |
| Real-time messaging | Socket.IO |
| Authentication | JWT, bcrypt |
| MFA | speakeasy TOTP, QRCode |
| Email OTP | Nodemailer |
| Google sign-in | google-auth-library |
| Validation | Zod |
| Security middleware | Helmet, CORS, express-rate-limit |
| File uploads | Multer |
| Backend testing | Jest |

---

## Repository Structure

```text
Secure-Chat-System/
├── docs/
│   ├── LOGGING-SETUP.md
│   ├── implementation-phases.md
│   └── logging-system.md
├── src/
│   ├── README.md
│   ├── client/
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   ├── icons.svg
│   │   │   └── shadow-link-logo.png
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── api.ts
│   │   │   │   └── chatE2ee.ts
│   │   │   ├── pages/
│   │   │   │   ├── admin.tsx
│   │   │   │   ├── chat.tsx
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   ├── profile.tsx
│   │   │   │   └── register.tsx
│   │   │   ├── App.jsx
│   │   │   ├── App.css
│   │   │   ├── index.css
│   │   │   └── main.jsx
│   │   ├── package.json
│   │   └── vite.config.js
│   └── server/
│       ├── config/
│       │   └── db.js
│       ├── lib/
│       │   ├── chatCrypto.js
│       │   └── profileValidation.js
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       ├── scripts/
│       │   └── create-profile-indexes.js
│       ├── services/
│       ├── sockets/
│       ├── tests/
│       │   └── profileValidation.test.js
│       ├── app.js
│       ├── jest.config.js
│       ├── package.json
│       └── server.js
└── ICT 932 Assessment 3.docx
```

---

## Prerequisites

- Node.js 20 or later.
- npm 10 or later.
- MongoDB running locally or a MongoDB Atlas connection string.
- SMTP credentials for registration OTP email delivery.
- A modern browser with Web Crypto API support.
- Optional: a Google Cloud OAuth client ID for Google sign-in.

---

## Installation

Clone the repository and install backend and frontend dependencies separately.

```bash
git clone <repository-url>
cd Secure-Chat-System
```

Install the backend:

```bash
cd src/server
npm install
```

Install the frontend:

```bash
cd ../client
npm install
```

The root `src/package.json` currently only declares `nodemailer` and does not provide app-level run scripts. Use `src/server` and `src/client` for development commands.

---

## Configuration

Create a `.env` file in `src/server`.

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/securechat
JWT_SECRET=replace-with-a-long-random-secret
TOTP_ISSUER=Shadow Link
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=no-reply@example.com

GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Optional frontend environment file in `src/client/.env`:

```env
VITE_SOCKET_URL=http://localhost:5000
```

This is recommended because the chat page defaults `VITE_SOCKET_URL` to `http://localhost:3000`, while the backend defaults to port `5000`. The Vite API proxy reads `PORT` from `src/server/.env`, so keeping `PORT=5000` in the server `.env` also keeps `/api` requests aligned.

---

## Running the Project

Start MongoDB first, then run the backend and frontend in separate terminals.

Backend:

```bash
cd src/server
npm run dev
```

Backend API:

```text
http://localhost:5000
```

Frontend:

```bash
cd src/client
npm run dev
```

Frontend app:

```text
http://localhost:5173
```

Useful health endpoints:

```text
GET /api/health
GET /api/health/env
```

The `/api/health/env` endpoint reports whether key environment variables are set. It is useful during local development, but should be removed or protected before production deployment.

---

## Usage Guide

### Register and Verify a Customer

1. Open `http://localhost:5173/register`.
2. Enter full name, email, and password.
3. Check the email inbox for the OTP.
4. Enter the OTP to activate the account.
5. Sign in from the login page.

SMTP configuration is required for a usable registration flow because the OTP is delivered by email.

### Set Up MFA

1. Sign in.
2. Open the Profile page.
3. Generate an authenticator setup QR code.
4. Scan the QR code with Google Authenticator, Authy, Microsoft Authenticator, or another TOTP app.
5. Enter the 6-digit code to enable MFA.

After MFA is enabled, login returns an MFA challenge and requires `/api/auth/mfa/verify-login` before issuing the normal session JWT.

### Start an Encrypted Chat

1. Both users must sign in and open the chat page at least once so their browser encryption public keys are uploaded.
2. Search for another customer by email.
3. Send a first encrypted message request.
4. The recipient accepts or rejects the request.
5. Once accepted, a direct chat thread is created and messages are delivered in real time.

Rejected first-contact requests are locked so the same requester cannot message that recipient again through the request flow.

### Admin Access

Admin routes require a user with `role: "admin"` in MongoDB. There is currently no admin bootstrap script or admin registration flow, so an admin account must be created or promoted manually in the database for local testing.

Admin workspace:

```text
http://localhost:5173/admin
```

---

## API Overview

All protected routes require:

```http
Authorization: Bearer <jwt>
```

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create inactive customer account and send email OTP. |
| POST | `/api/auth/verify-email` | Verify registration OTP and activate account. |
| POST | `/api/auth/login` | Login with email/password; may return MFA challenge. |
| POST | `/api/auth/google` | Login or register with a verified Google ID token. |
| POST | `/api/auth/mfa/verify-login` | Complete MFA login challenge. |
| POST | `/api/auth/mfa/setup` | Generate TOTP setup secret and QR code. |
| POST | `/api/auth/mfa/enable` | Enable TOTP after code verification. |
| POST | `/api/auth/mfa/disable` | Disable TOTP for current user. |
| GET | `/api/auth/me` | Return current authenticated user. |

### Profile

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/profile` | Get current user, profile, and supported country/language lists. |
| POST | `/api/profile` | Create profile. |
| PUT | `/api/profile` | Update profile. |
| POST | `/api/profile/picture` | Upload JPG, PNG, or WEBP profile picture up to 2 MB. |
| DELETE | `/api/profile/picture` | Remove profile picture. |

### Chat

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/chat/users` | List active customer users except current user. |
| GET | `/api/chat/users/search?email=` | Search active customer by email. |
| PUT | `/api/chat/keys/public` | Upload current browser public encryption key. |
| GET | `/api/chat/requests/incoming` | List pending incoming chat requests. |
| GET | `/api/chat/requests/outgoing` | List outgoing chat requests. |
| POST | `/api/chat/requests` | Create encrypted first-contact request. |
| POST | `/api/chat/requests/:requestId/accept` | Accept request and create thread. |
| POST | `/api/chat/requests/:requestId/reject` | Reject request and lock future requests from that sender. |
| GET | `/api/chat/threads` | List current user's threads. |
| POST | `/api/chat/threads/direct` | Create or update a direct thread with participant keys. |
| GET | `/api/chat/threads/:threadId/key` | Get encrypted thread key for current user. |
| GET | `/api/chat/threads/:threadId/messages` | List encrypted thread messages. |
| POST | `/api/chat/threads/:threadId/messages` | Send encrypted message through REST fallback. |
| POST | `/api/chat/threads/:threadId/join` | Validate access to a chat room. |

### Admin

Admin routes include:

```text
GET    /api/admin/dashboard
GET    /api/admin/users
POST   /api/admin/users/:userId/disable
POST   /api/admin/users/:userId/enable
GET    /api/admin/login-attempts
GET    /api/admin/alerts
PATCH  /api/admin/alerts/:alertId/status
PATCH  /api/admin/alerts/:alertId/note
POST   /api/admin/alerts/:alertId/disable-user
GET    /api/admin/threads
GET    /api/admin/message-integrity
GET    /api/admin/ephemeral-messages
GET    /api/admin/system-logs
GET    /api/admin/audit-trail
GET    /api/admin/devsecops
GET    /api/admin/logs
GET    /api/admin/logs/export
GET    /api/admin/logs/stats
GET    /api/admin/logs/critical
GET    /api/admin/logs/anomalies
```

### Socket.IO Events

The socket connection requires the JWT token in socket auth.

| Event | Direction | Description |
| --- | --- | --- |
| `room:join` | client to server | Join a thread room after access validation. |
| `chat:message:send` | client to server | Send encrypted message payload in real time. |
| `chat:message:new` | server to client | Broadcast newly stored encrypted message metadata and payload. |

---

## Chat Encryption Model

The current chat implementation uses browser-side encryption:

1. Each browser generates an RSA-OAEP identity key pair and stores it in `localStorage`.
2. The public key is uploaded to the backend with `/api/chat/keys/public`.
3. When a chat request is created, the client generates an AES-GCM thread key.
4. The AES-GCM thread key is wrapped separately for each participant using RSA-OAEP.
5. Message text is encrypted in the browser using AES-GCM.
6. The server stores only encrypted message fields: `ciphertext`, `iv`, `authTag`, and `algorithm`.
7. The receiving browser retrieves its encrypted thread key, unwraps it locally, and decrypts messages locally.

Important: the current implementation does not use ECDH key exchange, despite older documentation references. It uses RSA-OAEP key wrapping plus AES-GCM message encryption.

---

## Testing and Quality Checks

Run backend tests:

```bash
cd src/server
npm test
```

Current backend tests cover profile validation and `UserProfile` model behavior.

Run the frontend lint check:

```bash
cd src/client
npm run lint
```

Build the frontend:

```bash
cd src/client
npm run build
```

There is no frontend test script currently configured in `src/client/package.json`.

Optional security checks:

```bash
cd src/server
npm audit

cd ../client
npm audit
```

---

## Database and Maintenance Scripts

Create or synchronize profile indexes:

```bash
cd src/server
npm run migrate:profiles
```

The database connection also unsets `googleId` and `phoneNumber` when they are `null` so MongoDB sparse unique indexes behave correctly for missing optional identity fields.

Profile pictures are stored under:

```text
src/server/uploads/profile-pictures/
```

That directory is created automatically when the backend starts.

---

## Security Logging and Monitoring

The backend records security-relevant events in MongoDB, including:

- Registration attempts.
- Login success and failure.
- MFA challenge, success, and failure.
- Brute-force and repeated MFA failure indicators.
- Admin actions.
- Encrypted message storage events.
- Message integrity metadata.
- Suspicious alerts generated from log patterns.
- DevSecOps scan metadata used by the admin dashboard.

See `docs/logging-system.md` and `docs/LOGGING-SETUP.md` for additional logging design notes.

---

## Known Limitations and Future Improvements

- Email OTPs are stored in memory, so they are lost when the server restarts. Redis or database-backed OTP storage would be more reliable.
- SMTP is required for user-facing registration verification. If email delivery fails, the server still stores an OTP, but the user cannot retrieve it through the UI.
- There is no admin creation or seeding script.
- Google sign-in backend verification exists, but the visible login UI currently focuses on email/password and MFA.
- Frontend tests are not configured.
- CI/CD workflow files are not present in the repository.
- Some admin dashboard DevSecOps and message metadata records are seeded as demo metadata when the dashboard is opened.
- Ephemeral message metadata models and admin views exist, but automatic expiry/deletion worker behavior is not implemented.
- Browser private keys are stored in `localStorage`, which is acceptable for this academic prototype but not a hardened production key-storage design.
- Chat supports direct threads in the current UI; group thread metadata exists in models/admin views, but full group chat UX and group key management are not implemented.
- `/api/health/env` exposes configuration status and should be protected or removed before production deployment.

---

## Ethical Use

This project is for controlled educational use only. Security testing must be performed only against environments owned by the project team.

The system demonstrates secure software design concepts, but it has not been hardened for production use. Do not use it for real private or sensitive communication.

---

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [Express Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [MongoDB Documentation](https://www.mongodb.com/docs/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [JWT Introduction](https://jwt.io/introduction)
- [bcrypt npm package](https://www.npmjs.com/package/bcrypt)
- [Zod Documentation](https://zod.dev/)

---

## Assumptions

- The intended backend development port is `5000`.
- The intended frontend development port is `5173`.
- A local MongoDB database named `securechat` is acceptable for development.
- Admin accounts are managed manually in MongoDB until an admin bootstrap flow is added.
- The academic deliverable context from the original README remains accurate.

---

**Crown Institute of Higher Education**  
ICT932 - Cybersecurity Testing and Assurance | Semester 1, 2026
