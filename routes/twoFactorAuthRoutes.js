import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import twoFactorService from '../services/twoFactorService.js';
import { generateToken, generateRefreshToken } from '../middleware/jwtAuth.js';
import { User } from '../models/users.js';
import cookie from 'cookie';

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

// Store OTP sessions in memory (in production, use Redis or database)
const otpSessions = new Map();

// Send OTP endpoint
router.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required' 
      });
    }

    // Enhanced phone number validation
    const cleanPhone = phoneNumber.replace(/\s/g, '');
    const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required and must be at least 10 digits' 
      });
    }
    
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid phone number format. Please enter a valid Indian mobile number (10 digits starting with 6-9)' 
      });
    }
    
    // Additional validation for Indian numbers
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 13) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number must be between 10-13 digits' 
      });
    }

    // Send OTP using 2Factor service
    const result = await twoFactorService.sendOTP(phoneNumber);

    if (result.success) {
      // Store session info with database-formatted phone number
      const sessionId = result.sessionId;
      const dbFormattedPhone = result.dbFormattedPhone || twoFactorService.formatPhoneNumber(phoneNumber);
      
      otpSessions.set(sessionId, {
        phoneNumber: dbFormattedPhone,
        createdAt: new Date(),
        attempts: 0,
        verified: false,
        otpType: result.type || 'sms', // Store the type of OTP sent
        isFallback: result.fallback || false // Track if this was a fallback
      });

      // Clean up old sessions (older than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      for (const [id, session] of otpSessions.entries()) {
        if (session.createdAt < tenMinutesAgo) {
          otpSessions.delete(id);
        }
      }

      logger.info(`OTP sent successfully to ${dbFormattedPhone} (Type: ${result.type})`);

      res.json({ 
        success: true, 
        message: result.message || 'OTP sent successfully',
        sessionId: sessionId, // Send sessionId to frontend for verification
        otpType: result.type || 'sms', // Inform frontend about OTP type
        isFallback: result.fallback || false // Inform if this was a fallback
      });
    } else {
      logger.error('Failed to send OTP:', result.error);
      res.status(500).json({ 
        success: false, 
        error: result.error || 'Failed to send OTP' 
      });
    }

  } catch (error) {
    logger.error('Send OTP error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  try {
    const { sessionId, otp } = req.body;

    if (!sessionId || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID and OTP are required' 
      });
    }

    // Enhanced OTP validation
    const otpRegex = /^\d{4,8}$/;
    if (!otpRegex.test(otp)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid OTP format. OTP must be 4-8 digits' 
      });
    }

    // Check if session exists
    const session = otpSessions.get(sessionId);
    if (!session) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or expired session' 
      });
    }

    // Check if session is not too old (10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (session.createdAt < tenMinutesAgo) {
      otpSessions.delete(sessionId);
      return res.status(400).json({ 
        success: false, 
        error: 'Session expired. Please request a new OTP.' 
      });
    }

    // Check attempt limit (max 3 attempts)
    if (session.attempts >= 3) {
      otpSessions.delete(sessionId);
      return res.status(400).json({ 
        success: false, 
        error: 'Too many attempts. Please request a new OTP.' 
      });
    }

    // Increment attempts
    session.attempts++;

    // Verify OTP using 2Factor service
    const result = await twoFactorService.verifyOTP(sessionId, otp);

    if (result.success) {
      // Mark session as verified
      session.verified = true;
      
      try {
        // Check database connection before proceeding
        if (mongoose.connection.readyState !== 1) {
          logger.error('Database not connected during OTP verification');
          return res.status(503).json({ 
            success: false, 
            error: 'Database temporarily unavailable. Please try again later.' 
          });
        }

        // Validate phone number format before database operations
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(session.phoneNumber)) {
          logger.error(`Invalid phone number format for database: ${session.phoneNumber}`);
          return res.status(500).json({ 
            success: false, 
            error: 'Invalid phone number format. Please try again.' 
          });
        }

        // Find or create user in database
        let user = await User.findOne({ phoneNumber: session.phoneNumber });
        
        if (!user) {
          // Create new user
          logger.info(`Creating new user with phone: ${session.phoneNumber}`);
          user = new User({
            phoneNumber: session.phoneNumber,
            name: 'User', // Default name, can be updated later
            city: 'Delhi', // Default city, can be updated later
            email: '', // Default empty email
            lastLogin: new Date(),
            joinDate: new Date()
          });
          
          await user.save();
          logger.info(`New user created successfully: ${session.phoneNumber}`);
        } else {
          // Update last login
          logger.info(`Updating last login for existing user: ${session.phoneNumber}`);
          user.lastLogin = new Date();
          await user.save();
          logger.info(`User login updated successfully: ${session.phoneNumber}`);
        }
        
        // Generate JWT tokens
        const accessToken = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        
        // Set secure HTTP-only cookies
        const cookieOptions = {
          maxAge: 30 * 60 * 1000, // 30 minutes for access token
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' && req.secure,
          sameSite: 'lax',
          path: '/'
        };
        
        const refreshCookieOptions = {
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refresh token
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' && req.secure,
          sameSite: 'lax',
          path: '/'
        };

        res.cookie('urbanesta_token', accessToken, cookieOptions);
        res.cookie('urbanesta_refresh_token', refreshToken, refreshCookieOptions);

        logger.info(`OTP verified successfully for ${session.phoneNumber}`);

        res.json({ 
          success: true, 
          message: 'OTP verified successfully. User logged in.',
          user: {
            id: user._id,
            phoneNumber: user.phoneNumber,
            name: user.name,
            city: user.city,
            email: user.email,
            joinDate: user.joinDate
          }
        });
        
      } catch (dbError) {
        logger.error('Database error during OTP verification:', {
          error: dbError.message,
          stack: dbError.stack,
          phoneNumber: session.phoneNumber,
          errorType: dbError.name
        });
        
        // Handle specific database errors
        if (dbError.name === 'ValidationError') {
          const validationErrors = Object.values(dbError.errors).map(err => err.message).join(', ');
          logger.error(`User validation failed: ${validationErrors}`);
          return res.status(400).json({ 
            success: false, 
            error: `Validation failed: ${validationErrors}` 
          });
        }
        
        if (dbError.code === 11000) {
          logger.error(`Duplicate phone number: ${session.phoneNumber}`);
          return res.status(409).json({ 
            success: false, 
            error: 'Phone number already exists. Please try logging in instead.' 
          });
        }
        
        if (dbError.name === 'MongoNetworkError' || dbError.name === 'MongoTimeoutError') {
          logger.error('Database connection error:', dbError.message);
          return res.status(503).json({ 
            success: false, 
            error: 'Database temporarily unavailable. Please try again later.' 
          });
        }
        
        res.status(500).json({ 
          success: false, 
          error: 'Failed to create user account. Please try again.' 
        });
      }
    } else {
      logger.error('OTP verification failed:', result.error);
      res.status(400).json({ 
        success: false, 
        error: result.error || 'Invalid OTP' 
      });
    }

  } catch (error) {
    logger.error('Verify OTP error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Verify session middleware for 2Factor
export const verify2FactorSession = async (req, res, next) => {
  try {
    const sessionToken = req.cookies.urbanesta_2factor_session;
    
    if (!sessionToken) {
      return res.status(401).json({ 
        success: false, 
        error: 'No session found' 
      });
    }

    // Decode session token
    const decoded = Buffer.from(sessionToken, 'base64').toString('ascii');
    const [sessionId, timestamp] = decoded.split(':');
    
    // Check if session exists and is verified
    const session = otpSessions.get(sessionId);
    if (!session || !session.verified) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired session' 
      });
    }

    // Check if session is not too old (24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (new Date(parseInt(timestamp)) < twentyFourHoursAgo) {
      otpSessions.delete(sessionId);
      return res.status(401).json({ 
        success: false, 
        error: 'Session expired' 
      });
    }

    req.user = {
      phoneNumber: session.phoneNumber,
      sessionId: sessionId
    };
    
    next();

  } catch (error) {
    logger.error('2Factor session verification error', { error: error.message });
    res.status(401).json({ 
      success: false, 
      error: 'Invalid session' 
    });
  }
};

// Get current user info (2Factor)
router.get('/me', verify2FactorSession, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        phoneNumber: req.user.phoneNumber,
        sessionId: req.user.sessionId
      }
    });
  } catch (error) {
    logger.error('Get user info error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user info' 
    });
  }
});

// Logout endpoint (2Factor)
router.post('/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies.urbanesta_2factor_session;
    
    if (sessionToken) {
      // Decode and remove session
      const decoded = Buffer.from(sessionToken, 'base64').toString('ascii');
      const [sessionId] = decoded.split(':');
      otpSessions.delete(sessionId);
    }

    // Clear the cookie
    res.clearCookie('urbanesta_2factor_session', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    logger.info('User logged out');
    res.json({ success: true, message: 'Logged out successfully' });

  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Logout failed' 
    });
  }
});

// Get 2Factor account balance (admin endpoint)
router.get('/balance', async (req, res) => {
  try {
    const result = await twoFactorService.getBalance();
    
    if (result.success) {
      res.json({
        success: true,
        balance: result.balance
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Get balance error', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get balance' 
    });
  }
});

export default router;
