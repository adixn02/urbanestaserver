import express from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all auth routes
router.use(authLimiter);

// Health check for auth service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '2Factor SMS OTP Authentication Service is running',
    service: '2Factor.in SMS OTP',
    timestamp: new Date().toISOString()
  });
});

// Legacy Firebase endpoints - redirect to 2Factor
router.post('/sessionLogin', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Firebase authentication has been deprecated',
    message: 'Please use /api/2factor/send-otp and /api/2factor/verify-otp for SMS OTP authentication',
    newEndpoints: {
      sendOtp: '/api/2factor/send-otp',
      verifyOtp: '/api/2factor/verify-otp'
    }
  });
});

router.post('/sessionLogout', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Firebase authentication has been deprecated',
    message: 'Please use /api/user/logout for JWT-based logout',
    newEndpoint: '/api/user/logout'
  });
});

router.get('/me', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Firebase authentication has been deprecated',
    message: 'Please use /api/user/profile for user information',
    newEndpoint: '/api/user/profile'
  });
});

export default router;