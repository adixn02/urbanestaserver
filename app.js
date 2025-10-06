import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import logger from "./utils/logger.js";
import monitoring from "./utils/monitoring.js";
import { securityConfig, validateRequest, validateApiKey } from "./middleware/security.js";

// Import routes
import propertyRoutes from "./routes/urpropertyRoutes.js";
import builderRoutes from "./routes/builderRoutes.js";
import cityRoutes from "./routes/cityRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3012;

// Request logging middleware
app.use((req, res, next) => {
  const start = monitoring.startTimer();
  
  res.on('finish', () => {
    const responseTime = monitoring.endTimer(start);
    logger.logRequest(req, res, responseTime);
    monitoring.recordRequest(responseTime);
    
    if (res.statusCode >= 400) {
      monitoring.recordError();
    }
  });
  
  next();
});

// Security middleware
app.use(securityConfig.helmet);

// Request validation
app.use(validateRequest);

// Production Rate Limiting Configuration
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/healthz';
  }
});

// Stricter rate limiting for uploads
const uploadLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX) || 5, // Stricter limit for uploads
  message: {
    error: "Upload rate limit exceeded. Please try again later.",
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [
          process.env.FRONTEND_URL, 
          process.env.CLOUDFRONT_URL,
          process.env.FRONTEND_DOMAIN,
          ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [])
        ].filter(Boolean)
      : [
          "http://localhost:3000", 
          "http://localhost:3001", 
          "http://localhost:3002"
        ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGODB_URL;
    
    if (!mongoURI) {
      throw new Error("MONGODB_URI environment variable is required");
    }
    
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      connectTimeoutMS: 5000,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection error", { error: error.message });
    if (process.env.NODE_ENV === 'production') {
      logger.error("Database connection is required in production");
      process.exit(1);
    } else {
      logger.warn("Running in offline mode - API will return empty data");
    }
  }
};

// Connect to database
connectDB();

// Health check endpoint
app.get("/healthz", (req, res) => {
  const healthStatus = monitoring.getHealthStatus();
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.status(200).json({ 
    status: healthStatus.status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    database: dbStatus,
    memory: healthStatus.memory,
    requests: healthStatus.requests,
    errors: healthStatus.errors,
    errorRate: healthStatus.errorRate
  });
});

// Routes
app.use("/api/properties", propertyRoutes);
app.use("/api/builders", builderRoutes);
app.use("/api/cities", cityRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/upload", uploadLimiter, uploadRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Urbanesta API Server is running!",
    status: "healthy",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/healthz",
      properties: "/api/properties",
      builders: "/api/builders", 
      cities: "/api/cities",
      categories: "/api/categories"
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.logError(err, req);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : "Something went wrong"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
  logger.info(`Database: Connected to MongoDB`);
  logger.info(`Health check: http://localhost:${PORT}/healthz`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    logger.info('Database connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  mongoose.connection.close(() => {
    logger.info('Database connection closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});