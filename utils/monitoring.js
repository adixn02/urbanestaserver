import fs from 'fs';
import path from 'path';

class MonitoringService {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      uptime: Date.now(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
    
    this.logDir = './logs';
    this.ensureLogDir();
    
    // Start monitoring interval
    this.startMonitoring();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  startMonitoring() {
    // Monitor every 30 seconds
    setInterval(() => {
      this.collectMetrics();
      this.logMetrics();
    }, 30000);
  }

  collectMetrics() {
    this.metrics.memoryUsage = process.memoryUsage();
    this.metrics.cpuUsage = process.cpuUsage();
    this.metrics.uptime = Date.now() - this.metrics.uptime;
  }

  logMetrics() {
    const metricsData = {
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime,
      memory: {
        rss: Math.round(this.metrics.memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(this.metrics.memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(this.metrics.memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(this.metrics.memoryUsage.external / 1024 / 1024)
      },
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) : 0,
      avgResponseTime: this.metrics.responseTime.length > 0 
        ? Math.round(this.metrics.responseTime.reduce((a, b) => a + b, 0) / this.metrics.responseTime.length)
        : 0
    };

    const logMessage = `[METRICS] ${JSON.stringify(metricsData)}\n`;
    fs.appendFileSync(path.join(this.logDir, 'metrics.log'), logMessage);
  }

  recordRequest(responseTime) {
    this.metrics.requests++;
    this.metrics.responseTime.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime = this.metrics.responseTime.slice(-1000);
    }
  }

  recordError() {
    this.metrics.errors++;
  }

  getHealthStatus() {
    const memoryUsage = this.metrics.memoryUsage;
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    return {
      status: memoryUsagePercent > 90 ? 'unhealthy' : 'healthy',
      uptime: this.metrics.uptime,
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        percentage: Math.round(memoryUsagePercent)
      },
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) : 0
    };
  }

  // Performance monitoring
  startTimer() {
    return process.hrtime();
  }

  endTimer(startTime) {
    const diff = process.hrtime(startTime);
    return diff[0] * 1000 + diff[1] / 1000000; // Convert to milliseconds
  }

  // Memory monitoring
  checkMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (memoryUsagePercent > 90) {
      console.warn(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
      return false;
    }
    
    return true;
  }

  // Cleanup old logs
  cleanupLogs() {
    const logFiles = ['combined.log', 'err.log', 'metrics.log'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    logFiles.forEach(file => {
      const filePath = path.join(this.logDir, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > maxSize) {
          // Rotate log file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = `${file}.${timestamp}`;
          fs.renameSync(filePath, path.join(this.logDir, rotatedFile));
          // Rotated log file
        }
      }
    });
  }
}

export default new MonitoringService();
