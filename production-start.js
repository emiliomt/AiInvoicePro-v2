#!/usr/bin/env node

// Production startup script with enhanced error handling
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting production deployment...');

// Check if dist directory exists
if (!fs.existsSync('./dist')) {
  console.error('❌ dist directory not found. Running build first...');
  exec('npm run build', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Build failed:', error);
      process.exit(1);
    }
    console.log('✅ Build completed');
    startServer();
  });
} else {
  startServer();
}

function startServer() {
  console.log('🎯 Starting production server...');
  
  // Set production environment
  process.env.NODE_ENV = 'production';
  
  // Validate critical environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated');
  
  // Start the server
  const serverProcess = exec('node dist/index.js', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Server error:', error);
      process.exit(1);
    }
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log(data.toString().trim());
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(data.toString().trim());
  });
  
  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    if (code !== 0) {
      process.exit(code);
    }
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    serverProcess.kill('SIGTERM');
  });
  
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    serverProcess.kill('SIGINT');
  });
}