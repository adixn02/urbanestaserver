module.exports = {
  apps: [
    {
      name: "urbanesta-backend",
      script: "./app.js",
      
      // Development environment
      env: {
        NODE_ENV: "development",
        PORT: 3012,
        HOSTNAME: "127.0.0.1"
      },
      
      // Production environment
      env_production: {
        NODE_ENV: "production",
        PORT: 3012,
        HOSTNAME: "0.0.0.0"
      },
      
      // Load environment variables from .env files
      env_file: {
        development: ".env",
        production: ".env"
      },
      
      // PM2 Process Configuration
      instances: 1,
      exec_mode: "fork",
      watch: false,
      
      // Memory Management
      max_memory_restart: "1G",
      node_args: "--max-old-space-size=1024",
      
      // Logging Configuration
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      time: true,
      
      // Restart Configuration
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      
      // Health Monitoring
      health_check_grace_period: 3000,
      health_check_url: "http://localhost:3012/healthz",
      
      // Process Management
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // File Watching (disabled for production)
      ignore_watch: [
        "node_modules",
        "logs",
        ".git",
        "*.log",
        "*.tmp",
        ".env*",
        "coverage",
        "test"
      ],
      
      // Advanced Features
      source_map_support: true,
      instance_var: "INSTANCE_ID",
      
      // Environment-specific overrides
      env_development: {
        NODE_ENV: "development",
        PORT: 3012,
        HOSTNAME: "127.0.0.1",
        LOG_LEVEL: "debug"
      },
      
      env_production: {
        NODE_ENV: "production",
        PORT: 3012,
        HOSTNAME: "0.0.0.0",
        LOG_LEVEL: "info"
      }
    }
  ],
  
  // PM2 Deployment Configuration
  deploy: {
    production: {
      user: "ubuntu",
      host: ["10.0.2.133"],
      ref: "origin/main",
      repo: "git@github.com:your-username/urbanesta-backend.git",
      path: "/var/www/urbanesta-backend",
      "pre-deploy-local": "",
      "post-deploy": "npm install --production && pm2 reload ecosystem.config.cjs --env production",
      "pre-setup": ""
    }
  }
};
