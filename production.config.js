// Production configuration for deployment
const config = {
  // Environment settings
  NODE_ENV: 'production',
  
  // Server configuration
  HOST: '0.0.0.0',
  PORT: process.env.PORT || 5000,
  
  // Health check configuration
  HEALTH_CHECK_TIMEOUT: 30000,
  
  // Database configuration
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Error handling configuration
  ENABLE_ERROR_LOGGING: true,
  EXIT_ON_UNHANDLED_REJECTION: false,
  
  // Startup configuration
  STARTUP_TIMEOUT_DISABLED: true,
  
  // Required environment variables for production
  requiredEnvVars: [
    'DATABASE_URL',
    'PORT'
  ],
  
  // Optional environment variables
  optionalEnvVars: [
    'OPENAI_API_KEY',
    'REPL_ID',
    'REPLIT_DOMAINS'
  ]
};

module.exports = config;