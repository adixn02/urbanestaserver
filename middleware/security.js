import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';
import csurf from '@dr.pogodin/csurf';

// Security middleware configuration
export const securityConfig = {
  // Helmet configuration for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }),

  // Rate limiting configurations - Using environment variables
  rateLimits: {
    // General API rate limiting
    general: rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
      message: {
        error: "Too many requests from this IP, please try again later.",
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/healthz'
    }),

    // Strict rate limiting for sensitive endpoints
    strict: rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_STRICT_MAX) || 20,
      message: {
        error: "Rate limit exceeded for this endpoint. Please try again later.",
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false
    }),

    // Auth rate limiting
    auth: rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
      message: {
        error: "Too many authentication attempts. Please try again later.",
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false
    })
  }
};

// Request validation middleware
export const validateRequest = (req, res, next) => {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // JavaScript injection
    /on\w+\s*=/i  // Event handler injection
  ];

  const userAgent = req.get('User-Agent') || '';
  const url = req.originalUrl || '';
  const body = JSON.stringify(req.body) || '';

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent) || pattern.test(url) || pattern.test(body)) {
      return res.status(400).json({
        error: 'Suspicious request detected',
        message: 'Request blocked for security reasons'
      });
    }
  }

  next();
};

// API key validation middleware
export const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    return next(); // Skip if no API key is configured
  }

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  next();
};

// Request size validation
export const validateRequestSize = (maxSize = '50mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxSizeBytes = parseInt(maxSize.replace('mb', '')) * 1024 * 1024;

    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        error: 'Request too large',
        message: `Request size exceeds ${maxSize} limit`
      });
    }

    next();
  };
};

// IP whitelist middleware (for admin endpoints)
export const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // Skip if no IPs configured
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied from this IP address'
      });
    }

    next();
  };
};

// CSRF Protection middleware
export const csrfProtection = csurf({ 
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Input validation middleware using express-validator
export const validateInput = (validations) => {
  return async (req, res, next) => {
    // Run validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    
    next();
  };
};

// Common validation rules
export const validationRules = {
  email: body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  password: body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  phone: body('phone').isMobilePhone().withMessage('Valid phone number is required'),
  name: body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  city: body('city').trim().isLength({ min: 2, max: 50 }).withMessage('Valid city is required'),
  title: body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be 5-100 characters'),
  description: body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be 10-1000 characters'),
  price: body('price').isNumeric().isFloat({ min: 0 }).withMessage('Valid price is required'),
  minPrice: body('minPrice').isNumeric().isFloat({ min: 0 }).withMessage('Valid minimum price is required'),
  maxPrice: body('maxPrice').isNumeric().isFloat({ min: 0 }).withMessage('Valid maximum price is required')
};

export default {
  securityConfig,
  validateRequest,
  validateApiKey,
  validateRequestSize,
  ipWhitelist,
  csrfProtection,
  validateInput,
  validationRules
};
