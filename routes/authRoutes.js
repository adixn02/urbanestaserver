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
  let session = null; // Declare session at function scope for error handling
  
  try {
    const { sessionId, otp, name, city, propertyId, propertyName, propertyUrl, source } = req.body;

    if (!sessionId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and OTP are required'
      });
    }

    // Get stored session
    session = otpSessions.get(sessionId);

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
      
      logger.error(`OTP verification failed for sessionId: ${sessionId}, error: ${result.error || 'Unknown error'}`);
      
      // Provide user-friendly error messages
      let errorMessage = result.error || `Invalid OTP. ${3 - session.attempts} attempts remaining.`;
      
      // Check if it's a timeout or connection error
      if (result.error && (
        result.error.includes('timeout') || 
        result.error.includes('connection') ||
        result.error.includes('network')
      )) {
        errorMessage = 'Network error occurred. Please check your internet connection and try again.';
      } else if (result.error && result.error.includes('Invalid OTP')) {
        errorMessage = `Invalid OTP code. ${3 - session.attempts} attempts remaining.`;
      } else if (result.error) {
        // Use the error message from 2Factor service
        errorMessage = result.error;
      }
      
      return res.status(400).json({
        success: false,
        message: errorMessage
      });
    }

    // OTP verified successfully!
    session.verified = true;
    logger.info(`OTP verified successfully for phone: ${session.phoneNumber}`);

    // Extract 10-digit phone from phoneNumber if session.phone is missing
    let phone10Digit = session.phone;
    if (!phone10Digit && session.phoneNumber) {
      // Extract last 10 digits from phoneNumber (e.g., +919991553980 -> 9991553980)
      phone10Digit = session.phoneNumber.replace(/^\+91/, '').slice(-10);
    }
    
    if (!phone10Digit || phone10Digit.length !== 10) {
      logger.error(`Invalid phone number in session: ${JSON.stringify(session)}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number. Please request a new OTP.'
      });
    }

    // Check if user already exists - always proceed if OTP is verified
    let user = await User.findOne({ phoneNumber: session.phoneNumber });
    let isNewUser = false;
    let isReturningUser = false;

    try {
      if (!user) {
        // Try to create new user
        isNewUser = true;
        try {
          // Generate unique default email based on phone number
          // Format: user_<last10digits>@urbanesta.com (e.g., user_9991553980@urbanesta.com)
          const defaultEmail = `user_${phone10Digit}@urbanesta.com`;
          
          user = new User({
            name: name || session.name || 'User',
            phoneNumber: session.phoneNumber,
            city: city || 'Delhi', // Default city from schema
            email: defaultEmail, // Use default email instead of null to avoid duplicate key errors
            lastLogin: new Date()
            // joinDate is set automatically by schema default
          });
          await user.save();
          logger.info(`✅ New user created: ${user._id} - ${session.phoneNumber} with email: ${defaultEmail}`);
        } catch (createError) {
          // If duplicate key error (user created between check and save), find existing user
          if (createError.code === 11000) {
            // Check if it's an email duplicate error
            if (createError.message && createError.message.includes('email')) {
              // Try with a different unique email (add timestamp)
              const timestamp = Date.now();
              const uniqueEmail = `user_${phone10Digit}_${timestamp}@urbanesta.com`;
              logger.info(`Email duplicate detected, trying with unique email: ${uniqueEmail}`);
              
              try {
                user = new User({
                  name: name || session.name || 'User',
                  phoneNumber: session.phoneNumber,
                  city: city || 'Delhi',
                  email: uniqueEmail,
                  lastLogin: new Date()
                });
                await user.save();
                logger.info(`✅ New user created with unique email: ${user._id} - ${session.phoneNumber}`);
              } catch (retryError) {
                // If still fails, find existing user by phone
                logger.info(`Retry failed, finding existing user: ${session.phoneNumber}`);
                user = await User.findOne({ phoneNumber: session.phoneNumber });
                if (user) {
                  isNewUser = false;
                  isReturningUser = true;
                  user.lastLogin = new Date();
                  await user.save();
                  logger.info(`✅ Existing user found and logged in: ${user._id} - ${session.phoneNumber}`);
                } else {
                  logger.error(`Duplicate error but user not found: ${session.phoneNumber}`);
                  throw createError;
                }
              }
            } else {
              // Phone number duplicate - user created in parallel
              logger.info(`User created in parallel, finding existing user: ${session.phoneNumber}`);
              user = await User.findOne({ phoneNumber: session.phoneNumber });
              if (user) {
                isNewUser = false;
                isReturningUser = true;
                user.lastLogin = new Date();
                await user.save();
                logger.info(`✅ Existing user found and logged in: ${user._id} - ${session.phoneNumber}`);
              } else {
                // If user still doesn't exist after duplicate error, this is unexpected
                logger.error(`Duplicate error but user not found: ${session.phoneNumber}`);
                throw createError;
              }
            }
          } else {
            // Re-throw other errors
            throw createError;
          }
        }
      } else {
        // Existing user - this is a returning user, just log them in
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
    } catch (userError) {
      logger.error('Error creating/updating user:', {
        error: userError.message,
        stack: userError.stack,
        phoneNumber: session.phoneNumber,
        errorName: userError.name,
        errorCode: userError.code
      });
      
      // Last resort: try to find user one more time
      if (!user) {
        user = await User.findOne({ phoneNumber: session.phoneNumber });
        if (user) {
          isReturningUser = true;
          isNewUser = false;
          user.lastLogin = new Date();
          await user.save();
          logger.info(`✅ User found in last resort check: ${user._id}`);
        } else {
          // Only throw if we absolutely cannot proceed
          throw userError;
        }
      } else {
        // If we have a user but save failed, try to continue anyway
        logger.warn(`User save failed but user exists, continuing: ${user._id}`);
      }
    }

    // Create lead entry - wrap in try-catch for better error handling
    let lead;
    try {
      lead = new Lead({
        name: user.name,
        phone: phone10Digit, // Use extracted 10-digit phone
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
    } catch (leadError) {
      logger.error('Error creating lead:', {
        error: leadError.message,
        stack: leadError.stack,
        errorName: leadError.name,
        errorCode: leadError.code,
        leadData: {
          name: user.name,
          phone: phone10Digit,
          city: user.city || city || 'Delhi',
          propertyId,
          propertyName
        }
      });
      
      // If lead creation fails, still allow user to be logged in
      // but log the error for investigation
      logger.warn(`⚠️ Lead creation failed but user is logged in: ${user._id}`);
      
      // Continue without lead - user authentication is more important
      lead = null;
    }

    // Clean up session
    otpSessions.delete(sessionId);

    // Generate proper JWT tokens - wrap in try-catch
    let token, refreshToken;
    try {
      // Check if JWT_SECRET is configured
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured in environment variables');
      }

      token = generateToken(user);
      refreshToken = generateRefreshToken(user);
      
      logger.info(`✅ JWT tokens generated for user: ${user._id}`);
    } catch (tokenError) {
      logger.error('Error generating JWT tokens:', {
        error: tokenError.message,
        stack: tokenError.stack,
        userId: user._id,
        hasJWTSecret: !!process.env.JWT_SECRET
      });
      throw new Error(`Token generation failed: ${tokenError.message}`);
    }

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
        phone: phone10Digit,
        phoneNumber: user.phoneNumber,
        city: user.city,
        email: user.email,
        isReturning: isReturningUser,
        isNew: isNewUser
      },
      lead: lead ? {
        id: lead._id,
        propertyName: lead.propertyName
      } : null,
      token,
      refreshToken
    });

  } catch (error) {
    logger.error('Error verifying OTP:', {
      error: error.message,
      stack: error.stack,
      errorName: error.name,
      errorCode: error.code,
      sessionId: req.body?.sessionId,
      phoneNumber: session?.phoneNumber,
      hasSession: !!session
    });
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to verify OTP. Please try again.';
    
    if (error.name === 'ValidationError') {
      errorMessage = 'Validation error. Please check your information and try again.';
    } else if (error.code === 11000) {
      // Duplicate key error - handle gracefully
      if (error.message && error.message.includes('email')) {
        errorMessage = 'Account creation in progress. Please wait a moment and try again.';
      } else if (error.message && error.message.includes('phoneNumber')) {
        errorMessage = 'An account with this phone number already exists. Please try logging in.';
      } else {
        errorMessage = 'Account already exists. Please try logging in.';
      }
    } else if (error.message) {
      // Check for timeout or network errors
      if (error.message.includes('timeout') || error.message.includes('ECONNABORTED')) {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        errorMessage = 'Unable to connect to server. Please check your internet connection and try again.';
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.message.includes('E11000')) {
        // Generic duplicate key error
        errorMessage = 'Account creation in progress. Please wait a moment and try again.';
      } else {
        // Use the error message but make it more user-friendly
        errorMessage = error.message;
      }
    }
    
    // Note: We no longer return "account already exists" error
    // If OTP is verified, we always proceed to log in or create user
    
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
});

export default router;
