import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import logger from '../utils/logger.js';

// JWT Authentication Middleware
export const authenticateJWT = (req, res, next) => {
  try {
    // Get token from Authorization header or cookie
    let token = null;
    
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // If no token in header, check cookies
    if (!token) {
      const cookies = cookie.parse(req.headers.cookie || '');
      token = cookies.token || cookies.urbanesta_token;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required. Please log in.',
        code: 'NO_TOKEN'
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request
    req.user = {
      id: decoded.id,
      phoneNumber: decoded.phoneNumber,
      email: decoded.email,
      name: decoded.name,
      city: decoded.city
    };
    
    logger.info('JWT authentication successful', { 
      userId: req.user.id, 
      phoneNumber: req.user.phoneNumber 
    });
    
    next();
  } catch (error) {
    logger.error('JWT authentication failed', { error: error.message });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Please log in again.',
        code: 'INVALID_TOKEN'
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed. Please log in again.',
        code: 'AUTH_FAILED'
      });
    }
  }
};

// Generate JWT token
export const generateToken = (user) => {
  const payload = {
    id: user._id || user.id,
    phoneNumber: user.phoneNumber,
    email: user.email || '',
    name: user.name || '',
    city: user.city || 'Delhi'
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30m'
  });
};

// Generate refresh token
export const generateRefreshToken = (user) => {
  const payload = {
    id: user._id || user.id,
    phoneNumber: user.phoneNumber,
    type: 'refresh'
  };
  
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

export default authenticateJWT;
