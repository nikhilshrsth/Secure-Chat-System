const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const healthRoutes = require('./routes/healthRoutes');
const profileRoutes = require('./routes/profileRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { requestLogger } = require('./middleware/loggerMiddleware');

const app = express();

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const uploadsPath = path.join(__dirname, 'uploads');
const profilePicturesPath = path.join(uploadsPath, 'profile-pictures');

fs.mkdirSync(profilePicturesPath, { recursive: true });

app.use(helmet());
app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use(
  '/api',
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use('/uploads', express.static(uploadsPath));
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
