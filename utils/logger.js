import fs from 'fs';
import path from 'path';

class Logger {
  constructor() {
    this.logDir = './logs';
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  writeToFile(filename, message) {
    const filePath = path.join(this.logDir, filename);
    fs.appendFileSync(filePath, message);
  }

  info(message, meta = {}) {
    const formattedMessage = this.formatMessage('info', message, meta);
    console.log(formattedMessage.trim());
    this.writeToFile('combined.log', formattedMessage);
  }

  error(message, meta = {}) {
    const formattedMessage = this.formatMessage('error', message, meta);
    console.error(formattedMessage.trim());
    this.writeToFile('err.log', formattedMessage);
    this.writeToFile('combined.log', formattedMessage);
  }

  warn(message, meta = {}) {
    const formattedMessage = this.formatMessage('warn', message, meta);
    console.warn(formattedMessage.trim());
    this.writeToFile('combined.log', formattedMessage);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      const formattedMessage = this.formatMessage('debug', message, meta);
      console.log(formattedMessage.trim());
      this.writeToFile('combined.log', formattedMessage);
    }
  }

  // Request logging
  logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    };
    
    if (res.statusCode >= 400) {
      this.error('HTTP Request', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  // Error logging with stack trace
  logError(error, req = null) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name
    };

    if (req) {
      errorData.request = {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: req.body
      };
    }

    this.error('Application Error', errorData);
  }
}

export default new Logger();
