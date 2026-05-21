// Email OTP Service
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// In-memory store for OTPs (replace with Redis/DB for production)
const otpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function buildOtpKey(email, purpose = 'registration') {
  return `${String(email).toLowerCase().trim()}::${purpose}`;
}

function storeOtp(email, otp, purpose = 'registration') {
  otpStore.set(buildOtpKey(email, purpose), { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });
}

function verifyOtp(email, otp, purpose = 'registration') {
  const key = buildOtpKey(email, purpose);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }
  if (entry.otp === otp) {
    otpStore.delete(key);
    return true;
  }
  return false;
}

async function sendEmail(email, subject, text) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to: email,
    subject,
    text,
  });
}

async function sendOtpEmail(email, otp, purpose = 'registration') {
  if (purpose === 'password-reset') {
    return sendEmail(
      email,
      'Your Secure Chat Password Reset Code',
      `Your password reset code is: ${otp}. This code expires in 10 minutes.`,
    );
  }

  return sendEmail(
    email,
    'Your Secure Chat Registration Code',
    `Your confirmation code is: ${otp}. This code expires in 10 minutes.`,
  );
}

module.exports = {
  generateOtp,
  storeOtp,
  verifyOtp,
  sendEmail,
  sendOtpEmail,
};
