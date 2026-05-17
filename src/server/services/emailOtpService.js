// Email OTP Service
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// In-memory store for OTPs (replace with Redis/DB for production)
const otpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function storeOtp(email, otp) {
  otpStore.set(email, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });
}

function verifyOtp(email, otp) {
  const entry = otpStore.get(email);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return false;
  }
  if (entry.otp === otp) {
    otpStore.delete(email);
    return true;
  }
  return false;
}

async function sendOtpEmail(email, otp) {
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
    subject: 'Your Secure Chat Registration Code',
    text: `Your confirmation code is: ${otp}`,
  });
}

module.exports = {
  generateOtp,
  storeOtp,
  verifyOtp,
  sendOtpEmail,
};
