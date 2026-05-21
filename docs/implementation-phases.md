# Secure Chat System Implementation Phases

This document breaks the project into simple build phases. The goal is to build a working system first, then add security features, tests, CI/CD, and documentation.

For a requirement-by-requirement mapping of implemented features to code and routes, see `docs/feature-compliance.md`.

---

## Phase 1: Project Setup

**Goal:** Create the project structure and install the basic tools.

### Tasks

- Create the main folders:

```bash
mkdir -p src/client src/server docs tests ci-cd .github/workflows
```

- Set up the backend:

```bash
cd src/server
npm init -y
npm install express mongoose dotenv cors helmet express-rate-limit bcrypt jsonwebtoken socket.io speakeasy qrcode zod
npm install -D nodemon jest supertest
```

- Set up the frontend:

```bash
cd ../client
npm create vite@latest . -- --template react
npm install
npm install axios socket.io-client react-router-dom
```

### Phase Output

- Backend project created.
- Frontend React project created.
- Required folders are ready.

---

## Phase 2: Backend Foundation

**Goal:** Create a working Express server connected to MongoDB.

### Suggested Structure

```text
src/server/
├── server.js
├── app.js
├── config/
│   └── db.js
├── models/
│   ├── User.js
│   ├── Message.js
│   └── SecurityLog.js
├── routes/
├── controllers/
├── middleware/
└── sockets/
```

### Tasks

- Create the Express app.
- Connect to MongoDB.
- Add environment variables in `.env`.
- Add a health check route:

```text
GET /api/health
```

### Phase Output

The backend should respond with:

```json
{ "status": "ok" }
```

---

## Phase 3: Authentication and RBAC

**Goal:** Allow users to register, log in, and access protected routes.

### Routes

```text
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me
```

### Tasks

- Create the `User` model.
- Hash passwords with bcrypt.
- Generate JWTs after login.
- Add authentication middleware.
- Add user roles:

```text
user
admin
```

- Add admin-only middleware.

### Phase Output

- Users can register.
- Users can log in.
- Protected routes require a JWT.
- Admin routes require the `admin` role.

---

## Phase 4: Two-Factor Authentication

**Goal:** Add required 2FA using an authenticator app.

### Routes

```text
POST /api/auth/2fa/setup
POST /api/auth/2fa/verify
```

### Tasks

- Generate a TOTP secret using `speakeasy`.
- Generate a QR code using `qrcode`.
- Show the QR code to the user.
- Verify the 6-digit authenticator code.
- Require successful 2FA before completing login.

### Phase Output

- Users can set up 2FA.
- Login requires password and TOTP code.

---

## Phase 5: Basic Frontend

**Goal:** Create simple screens that connect to the backend.

### Pages

```text
src/client/src/pages/
├── Register.jsx
├── Login.jsx
├── TwoFactor.jsx
├── Chat.jsx
└── Admin.jsx
```

### Routes

```text
/register
/login
/2fa
/chat
/admin
```

### Tasks

- Create register form.
- Create login form.
- Create 2FA verification screen.
- Store JWT after login.
- Protect chat and admin pages.

### Phase Output

- Users can register from the frontend.
- Users can log in and complete 2FA.
- Users are redirected to the chat page after login.

---

## Phase 6: Real-Time Chat

**Goal:** Send and receive messages in real time.

### Socket Events

```text
message:send
message:receive
room:join
```

### Tasks

- Add Socket.IO to the backend.
- Authenticate socket connections using JWT.
- Create send-message logic.
- Save messages to MongoDB.
- Display incoming messages in the frontend.
- Add simple one-to-one chat first.
- Add basic group chat after one-to-one chat works.

### Phase Output

- Logged-in users can send and receive chat messages.
- Messages are saved in MongoDB.

---

## Phase 7: Message Encryption

**Goal:** Encrypt messages before sending and store only encrypted content.

### Simple Security Design

- Use Web Crypto API in the browser.
- Generate an ECDH key pair for each user.
- Store the private key in the browser.
- Send the public key to the backend.
- Derive a shared AES-GCM key for chat.
- Encrypt messages before sending.
- Decrypt messages on the recipient client.

### Message Model Fields

```js
{
  sender,
  receiver,
  roomId,
  ciphertext,
  iv,
  createdAt,
  expiresAt
}
```

### Tasks

- Add frontend crypto helper functions.
- Generate and store user key pairs.
- Save public keys in the backend.
- Encrypt outgoing messages.
- Decrypt incoming messages.
- Confirm MongoDB does not store plaintext messages.
- Add simple ephemeral message expiry using `expiresAt`.

### Phase Output

- Message content is encrypted before storage.
- Plaintext messages are not visible in MongoDB.
- AES-GCM provides message integrity protection.

---

## Phase 8: Admin Dashboard and Security Logs

**Goal:** Add basic monitoring and admin visibility.

### SecurityLog Model

```js
{
  eventType,
  userId,
  ipAddress,
  success,
  details,
  createdAt
}
```

### Events to Log

- User registration
- Successful login
- Failed login
- Failed 2FA
- Admin disables user
- Repeated failed login attempts

### Admin Features

- View users.
- Enable or disable users.
- View recent security logs.

### Phase Output

- Admin can monitor basic security events.
- The project has evidence for monitoring and incident response.

---

## Phase 9: Testing

**Goal:** Prove that important features and security controls work.

### Backend Tests

- User can register.
- Password is not stored as plaintext.
- Login rejects wrong password.
- 2FA is required.
- Protected routes reject missing JWT.
- Normal user cannot access admin route.
- Message content is stored encrypted.

### Security Testing Evidence

Run and document:

- SAST using Semgrep or ESLint security rules.
- Dependency scan using `npm audit`.
- DAST using OWASP ZAP baseline scan.
- Secret scan using Gitleaks.

### Phase Output

- Test results are available.
- Security scan findings are documented.
- Remediation notes are added where needed.

---

## Phase 10: CI/CD Pipeline

**Goal:** Add a simple DevSecOps pipeline.

### Required Pipeline Stages

```text
Build -> SAST -> Test -> DAST -> Deploy
```

### Tasks

- Create GitHub Actions workflow:

```text
.github/workflows/security-pipeline.yml
```

- Add dependency installation.
- Add build step.
- Add SAST step.
- Add Jest/Supertest test step.
- Add dependency audit.
- Add OWASP ZAP baseline scan.
- Add secret scanning.
- Add simple deploy or staging build step.

### Phase Output

- Pipeline runs automatically on push or pull request.
- Pipeline output can be used as assessment evidence.

---

## Phase 11: Documentation

**Goal:** Prepare the documents needed for the final report and presentation.

### Documents to Create

```text
docs/architecture.md
docs/threat-model.md
docs/api-docs.md
docs/testing-report.md
docs/incident-response.md
```

### Tasks

- Add architecture diagram and message flow.
- Add STRIDE threat model.
- Document REST API routes.
- Document Socket.IO events.
- Add screenshots or logs from tests and security scans.
- Document one simulated incident, such as repeated failed logins.

### Phase Output

- Documentation is ready to support the final report.
- Screenshots and logs are collected as evidence.

---

## Phase 12: Final Demo Preparation

**Goal:** Prepare a smooth presentation and live demonstration.

### Recommended Demo Flow

1. Register a user.
2. Set up 2FA.
3. Log in.
4. Send an encrypted message.
5. Show that MongoDB stores ciphertext.
6. Show admin dashboard logs.
7. Demonstrate failed login or failed 2FA logging.
8. Show GitHub Actions pipeline.
9. Show security scan results.

### Phase Output

- The team can confidently demonstrate the working prototype.
- The demo highlights the required security and DevSecOps features.

---

## Recommended Build Order

Use this order to avoid unnecessary complexity:

1. Backend health check
2. MongoDB connection
3. Register, login, and JWT
4. RBAC
5. 2FA
6. Frontend auth pages
7. Basic chat
8. Message encryption
9. Admin logs
10. Tests
11. CI/CD
12. Documentation and demo polish

