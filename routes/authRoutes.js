import express from 'express';
import { User } from '../models/users.js'; // Named export from lowercase users.js
import Lead from '../models/Lead.js'; // Default export
import twoFactorService from '../services/twoFactorService.js';
import { generateToken, generateRefreshToken } from '../middleware/jwtAuth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// In-memory session storage (stores sessionId mapping)
const otpSessions = new Map();

// Send OTP using existing 2Factor service
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, name, city, propertyId, propertyName, propertyUrl } = req.body;

    if (!phone || phone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit phone number'
      });
    }

    // Format phone number for 2Factor (add +91 prefix)
    const phoneNumber = `+91${phone}`;
    
    logger.info(`Sending OTP to ${phoneNumber} for user: ${name}`);

    // Send OTP using 2Factor service
    const result = await twoFactorService.sendOTP(phoneNumber);

    if (result.success) {
      // Store session info with user details
      const sessionId = result.sessionId;
      
      otpSessions.set(sessionId, {
        phoneNumber: result.dbFormattedPhone || phoneNumber,
        phone: phone, // Store original 10-digit phone
        name: name,
        city: city,
        propertyId: propertyId,
        propertyName: propertyName,
        propertyUrl: propertyUrl,
        createdAt: new Date(),
        attempts: 0,
        verified: false,
        otpType: result.type || 'sms'
      });

      // Clean up old sessions (older than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      for (const [id, session] of otpSessions.entries()) {
        if (session.createdAt < tenMinutesAgo) {
          otpSessions.delete(id);
        }
      }

      logger.info(`OTP sent successfully to ${phoneNumber}, sessionId: ${sessionId}`);

      res.json({
        success: true,
        message: 'OTP sent successfully to your mobile number',
        sessionId: sessionId
      });
    } else {
      logger.error('Failed to send OTP:', result.error);
      res.status(500).json({
        success: false,
        message: result.error || 'Failed to send OTP. Please try again.'
      });
    }

  } catch (error) {
    logger.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again.'
    });
  }
});

// Verify OTP using 2Factor and create user + lead
router.post('/verify-otp', async (req, res) => {
  try {
    const { sessionId, otp, name, city, propertyId, propertyName, propertyUrl, source } = req.body;

    if (!sessionId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and OTP are required'
      });
    }

    // Get stored session
    const session = otpSessions.get(sessionId);

    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Session expired or invalid. Please request a new OTP.'
      });
    }

    // Check if session is too old (10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (session.createdAt < tenMinutesAgo) {
      otpSessions.delete(sessionId);
      return res.status(400).json({
        success: false,
        message: 'Session has expired. Please request a new OTP.'
      });
    }

    // Check attempts (max 3)
    if (session.attempts >= 3) {
      otpSessions.delete(sessionId);
      return res.status(400).json({
        success: false,
        message: 'Maximum attempts exceeded. Please request a new OTP.'
      });
    }

    logger.info(`Verifying OTP for sessionId: ${sessionId}`);

    // Verify OTP using 2Factor service
    const result = await twoFactorService.verifyOTP(sessionId, otp);

    if (!result.success) {
      // Increment attempts on failure
      session.attempts += 1;
      otpSessions.set(sessionId, session);
      
      logger.error(`OTP verification failed for sessionId: ${sessionId}`);
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${3 - session.attempts} attempts remaining.`
      });
    }

    // OTP verified successfully!
    session.verified = true;
    logger.info(`OTP verified successfully for phone: ${session.phoneNumber}`);

    // Check if user already exists
    let user = await User.findOne({ phoneNumber: session.phoneNumber });
    let isNewUser = false;
    let isReturningUser = false;

    if (!user) {
      // Create new user
      isNewUser = true;
      user = new User({
        name: name || session.name || 'User',
        phoneNumber: session.phoneNumber,
        city: city || 'Delhi', // Default city from schema
        email: null, // Explicitly set to null for sparse unique index
        lastLogin: new Date()
        // joinDate is set automatically by schema default
      });
      await user.save();
      logger.info(`✅ New user created: ${user._id} - ${session.phoneNumber}`);
    } else {
      // Existing user - this is a returning user
      isReturningUser = true;
      
      // Update existing user if name or city changed
      let updated = false;
      if (name && name !== 'User' && user.name !== name) {
        user.name = name;
        updated = true;
      }
      if (city && user.city !== city) {
        user.city = city;
        updated = true;
      }
      user.lastLogin = new Date();
      updated = true;
      
      if (updated) {
        await user.save();
        logger.info(`✅ Returning user updated: ${user._id} - ${session.phoneNumber}`);
      } else {
        logger.info(`✅ Returning user logged in: ${user._id} - ${session.phoneNumber}`);
      }
    }

    // Create lead entry
    const lead = new Lead({
      name: user.name,
      phone: session.phone, // Original 10-digit phone
      email: user.email || null,
      city: user.city || city || 'Delhi',
      propertyId: propertyId || null,
      propertyName: propertyName || null,
      propertyUrl: propertyUrl || null,
      propertyInterest: propertyName || null,
      source: 'website', // Using existing enum value
      status: 'new',
      priority: 'medium',
      notes: [{
        note: `Lead captured via OTP verification from ${source || 'get_in_touch_otp'}`,
        addedAt: new Date()
      }]
    });
    await lead.save();
    logger.info(`✅ Lead created: ${lead._id} for property: ${propertyName || 'N/A'}`);

    // Clean up session
    otpSessions.delete(sessionId);

    // Generate proper JWT tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    
    logger.info(`✅ JWT tokens generated for user: ${user._id}`);

    // Set authentication cookies
    const accessTokenOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes for access token
      path: '/'
    };

    const refreshTokenOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
      path: '/'
    };

    // Set multiple cookies for compatibility and security
    res.cookie('urbanesta_token', token, accessTokenOptions);
    res.cookie('token', token, accessTokenOptions);
    res.cookie('refreshToken', refreshToken, refreshTokenOptions);
    res.cookie('userId', user._id.toString(), accessTokenOptions);

    logger.info(`✅ Authentication cookies set for user: ${user._id}`);

    res.json({
      success: true,
      message: isReturningUser ? 'Welcome back! You\'re logged in.' : 'Account created successfully. Welcome!',
      user: {
        id: user._id,
        name: user.name,
        phone: session.phone,
        phoneNumber: user.phoneNumber,
        city: user.city,
        email: user.email,
        isReturning: isReturningUser,
        isNew: isNewUser
      },
      lead: {
        id: lead._id,
        propertyName: lead.propertyName
      },
      token,
      refreshToken
    });

  } catch (error) {
    logger.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP. Please try again.'
    });
  }
});

export default router;
