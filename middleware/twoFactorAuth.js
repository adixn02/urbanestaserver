import logger from '../utils/logger.js';

// Middleware to verify 2Factor authentication
export const verify2FactorAuth = (req, res, next) => {
  try {
    const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'urbanesta_session';
    const sessionToken = req.cookies[sessionCookieName];

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    // Parse session token to extract user info
    // Format: session_phoneNumber_timestamp
    const phoneNumberMatch = sessionToken.match(/session_(\d+)_/);
    
    if (!phoneNumberMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token. Please log in again.'
      });
    }

    const phoneNumber = phoneNumberMatch[1];
    
    // Add user info to request object
    req.user = {
      phoneNumber: phoneNumber,
      sessionToken: sessionToken
    };

    logger.info('2Factor authentication successful', { phoneNumber });
    next();
  } catch (error) {
    logger.error('2Factor authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed. Please log in again.'
    });
  }
};

export default verify2FactorAuth;
