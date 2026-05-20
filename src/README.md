# Secure Chat Application

> A secure real-time chat application built with the MERN stack for ICT932 Cybersecurity Testing and Assurance.

**Unit:** ICT932 - Cybersecurity Testing and Assurance  
**Course:** Master of Information Technology (MIT)  
**Semester:** S1-2026  
**Assessment:** Assessment 3 - Cybersecurity Project Implementation  
**Project Option:** Project 6 - Secure Chat Application

---

## Project Overview

This project is a secure chat system that allows registered users to send real-time encrypted messages. The system focuses on practical security controls that are achievable within the assessment timeframe while still demonstrating strong cybersecurity design.

The application uses:

- React for the frontend
- Node.js and Express for the backend API
- MongoDB for data storage
- Socket.IO for real-time messaging
- JWT-based authentication
- Password hashing with bcrypt
- Two-factor authentication using TOTP
- Client-side message encryption using browser cryptography APIs

The goal is to build a system that is secure, understandable, testable, and suitable for a live demonstration.

---

## Main Objectives

- Build a working real-time chat application.
- Secure user registration and login.
- Store passwords safely using bcrypt.
- Protect API routes using JWT authentication.
- Add two-factor authentication for login.
- Encrypt chat messages before storing or transmitting them.
- Add basic role-based access control for normal users and admins.
- Log important security events such as login attempts and failed authentication.
- Test the application using unit, integration, and security tests.
- Use a simple DevSecOps pipeline with build, security scan, test, DAST, and deploy stages.

---

## Team Members

| Name | Student ID | Role | Contribution |
|------|------------|------|--------------|
| [Member 1] | [ID] | Backend and Authentication | TBD |
| [Member 2] | [ID] | Frontend and Chat UI | TBD |
| [Member 3] | [ID] | Security Testing and CI/CD | TBD |
| [Member 4] | [ID] | Documentation and Threat Model | TBD |

---

## Core Features

### User Features

- User registration and login
- Two-factor authentication using an authenticator app
- Password hashing with bcrypt
- JWT authentication
- Real-time one-to-one chat
- Basic group chat
- Encrypted message content
- Simple ephemeral messages
- Chat history
- Logout

### Admin Features

- Admin-only dashboard
- View registered users
- View login and security event logs
- Disable or enable user accounts

### Security Features

- Password hashing with bcrypt
- JWT access control
- Two-factor authentication using TOTP
- Role-based access control
- Input validation
- Rate limiting on authentication routes
- Secure HTTP headers using Helmet
- CORS restrictions
- ECDH key exchange for chat encryption
- AES-GCM message encryption before database storage
- Encrypted message content stored at rest in MongoDB
- Message integrity verification using AES-GCM authentication tags
- Audit logging for important events
- Environment-based secrets

---

## Optional Features

These features are useful but should only be added after the core system is complete:

- Refresh tokens
- Docker Compose setup
- Advanced group key management
- Certificate-based authentication

---

## Simplified Architecture

```text
React Client
     |
     | HTTPS / Socket.IO
     |
Express API + Socket.IO Server
     |
     | Mongoose
     |
MongoDB
```

### Message Flow

1. A user logs in and receives a JWT.
2. The user completes TOTP-based two-factor authentication.
3. The client connects to the server using Socket.IO.
4. Chat participants derive a shared key using ECDH.
5. Before sending a message, the client encrypts the message content using AES-GCM.
6. The server receives and stores the encrypted message.
7. The recipient receives the encrypted message and decrypts it on their client.

The implementation should stay simple: ECDH and AES-GCM are required for the chat security design, but advanced key rotation and complex group key management can be treated as future improvements.

---

## Technology Stack

| Area | Technology |
|------|------------|
| Frontend | React, Vite, TailwindCSS |
| Backend | Node.js, Express |
| Database | MongoDB, Mongoose |
| Real-time Messaging | Socket.IO |
| Authentication | JWT, bcrypt |
| 2FA | TOTP using speakeasy |
| Security Middleware | Helmet, CORS, express-rate-limit |
| Validation | Joi or Zod |
| Logging | Winston or Morgan |
| Testing | Jest, Supertest, React Testing Library |
| CI/CD | GitHub Actions |
| Security Checks | Semgrep or ESLint security rules, npm audit, OWASP ZAP, Gitleaks |

---

## Repository Structure

```text
secure-chat-system/
├── src/
│   ├── client/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── context/
│   │   │   ├── services/
│   │   │   ├── crypto/
│   │   │   └── App.jsx
│   │   ├── package.json
│   │   └── vite.config.js
│   └── server/
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       ├── sockets/
│       ├── utils/
│       ├── app.js
│       ├── server.js
│       └── package.json
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   ├── api-docs.md
│   └── testing-report.md
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
├── ci-cd/
│   ├── zap/
│   └── deployment/
├── .github/
│   └── workflows/
├── .env.example
├── .gitignore
└── README.md
```

---

## Prerequisites

- Node.js 20 or higher
- npm 10 or higher
- MongoDB 7 or MongoDB Atlas
- Git
- Modern browser such as Chrome, Firefox, Edge, or Safari

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/<your-team>/secure-chat-system.git
cd secure-chat-system
```

### 2. Install Backend Dependencies

```bash
cd src/server
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../client
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in `src/server`:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/securechat
JWT_SECRET=replace-with-a-strong-secret
TOTP_ISSUER=SecureChat
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=5
```

Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Running the Application

### Start the Backend

```bash
cd src/server
npm run dev
```

Backend API:

```text
http://localhost:5000
```

### Start the Frontend

```bash
cd src/client
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

## Security Design

The project focuses on a practical security baseline:

| Security Area | Implementation |
|---------------|----------------|
| Password security | bcrypt hashing |
| Authentication | JWT tokens |
| Two-factor authentication | TOTP authenticator code during login |
| Authorization | User and admin roles |
| Input validation | Joi or Zod schemas |
| Rate limiting | Limit repeated login attempts |
| Secure headers | Helmet middleware |
| CORS | Allow only trusted frontend origin |
| Message privacy | ECDH key exchange and AES-GCM message encryption |
| Database storage | Store encrypted message content instead of plaintext |
| Message integrity | AES-GCM authentication tags |
| Auditability | Log security-relevant events |
| Secret management | Use `.env`, never hard-code secrets |

### OWASP Top 10 Coverage

The project will address at least three OWASP Top 10 categories:

- Broken Access Control: role checks for protected and admin routes
- Cryptographic Failures: hashed passwords, ECDH key exchange, and AES-GCM encrypted messages
- Injection: input validation and safe Mongoose queries
- Identification and Authentication Failures: secure login, 2FA, rate limiting, and JWT checks

---

## Testing

### Backend Tests

```bash
cd src/server
npm test
```

Backend testing should cover:

- User registration
- Login
- Two-factor authentication
- Protected routes
- Admin-only routes
- Message creation and retrieval
- Input validation

### Frontend Tests

```bash
cd src/client
npm test
```

Frontend testing should cover:

- Login form validation
- Register form validation
- Chat screen rendering
- Message send flow

### Security Tests

Security testing should include:

- Repeated failed login attempts
- Accessing protected routes without a token
- Accessing admin routes as a normal user
- Invalid or malicious input
- Checking that plaintext messages are not stored in MongoDB
- Checking that message tampering is rejected or detected
- Running SAST with Semgrep or ESLint security rules
- Running dependency checks with `npm audit`
- Running a basic DAST scan with OWASP ZAP
- Running secret scanning with Gitleaks

### Performance and User Testing

Keep this lightweight:

- Test normal chat usage with multiple users.
- Record basic response time or message delivery observations.
- Collect short peer feedback from test users before the final report.

---

## CI/CD Pipeline

The GitHub Actions pipeline should stay simple but must include the required DevSecOps stages:

```text
Build -> SAST -> Test -> DAST -> Deploy
```

Recommended checks:

- Semgrep or ESLint security rules
- Jest tests
- `npm audit`
- OWASP ZAP baseline scan
- Gitleaks

The deploy stage can be simple, such as building the frontend and backend or deploying to a controlled staging environment. The goal is to show a working security-aware pipeline without overengineering the deployment.

---

## Monitoring and Incident Response

The project should include basic security monitoring:

- Log successful and failed login attempts.
- Log admin actions.
- Log repeated failed authentication attempts.
- Document one simulated incident, such as repeated failed logins, and explain the response.

---

## Project Milestones

| Week | Milestone | Status |
|------|-----------|--------|
| Week 5 | Project selection | Not started |
| Week 6 | Project plan, repo setup, and threat model | Not started |
| Week 8 | Authentication and basic chat working | Not started |
| Week 10 | 2FA, encrypted messages, admin features, and CI/CD pipeline | Not started |
| Week 12 | Final demo and presentation | Not started |
| Week 13 | Final report submission | Not started |

---

## Documentation

The project should include:

- `docs/architecture.md` - system design and data flow
- `docs/threat-model.md` - STRIDE threat model
- `docs/api-docs.md` - REST API and Socket.IO events
- `docs/testing-report.md` - test results and security testing evidence
- `docs/incident-response.md` - simulated incident and response notes

---

## Assessment Deliverables

Final submission should include:

- GitHub repository with source code, tests, documentation, and CI/CD files.
- Evidence of regular commits from each team member.
- Working prototype and live demonstration.
- Presentation slides covering the project, security design, DevSecOps pipeline, testing results, challenges, and lessons learned.
- Final report with screenshots, logs, security findings, remediation evidence, and references.
- Completed assessment cover sheet, including contribution percentages and AI/tool use declaration.

---

## Ethical Considerations

This project is for educational use only. All testing must be performed in a controlled environment owned by the project team.

The system should not be used for real private communication. It is designed to demonstrate secure software development concepts for an academic assessment.

Admin users may view system metadata and security logs, but message content should remain encrypted.

---

## Contributing

This is a team academic project.

Recommended workflow:

1. Create a feature branch.
2. Make focused commits.
3. Open a pull request.
4. Request review from a teammate.
5. Merge only after tests pass.

Use clear commit messages, for example:

```text
feat: add login endpoint
fix: validate message input
test: add auth route tests
docs: update threat model
```

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
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

**Crown Institute of Higher Education**  
ICT932 - Cybersecurity Testing and Assurance | Semester 1, 2026
