const express = require('express');

const router = express.Router();


router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'secure-chat-api',
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint to check dotenv loading
router.get('/env', (req, res) => {
  res.status(200).json({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    CLIENT_URL: process.env.CLIENT_URL,
    MONGO_URI: process.env.MONGO_URI ? 'set' : 'missing',
    JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'missing',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'set' : 'missing',
    TOTP_ISSUER: process.env.TOTP_ISSUER,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
  });
});

module.exports = router;
