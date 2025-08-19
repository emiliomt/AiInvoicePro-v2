#!/usr/bin/env node

/**
 * Debug Capture Sanitization Script
 * 
 * This script sanitizes HTML debug captures by removing or masking
 * potentially sensitive tokens and API keys that might be detected
 * by security scanners, even if they are false positives.
 */

import fs from 'fs';
import path from 'path';

const SENSITIVE_PATTERNS = [
  // Usetiful tokens
  /r\.dataset\.token\s*=\s*["']([a-f0-9]{32})["']/gi,
  // Generic API key patterns
  /["']([a-zA-Z0-9]{32,})["']/g,
  // Bearer tokens (though these are already in the captures)
  /Bearer\s+[A-Za-z0-9+/=]{100,}/gi
];

function sanitizeFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    SENSITIVE_PATTERNS.forEach(pattern => {
      const newContent = content.replace(pattern, (match, group1) => {
        modified = true;
        if (group1 && group1.length >= 8) {
          // Mask all but first 4 and last 4 characters for captured groups
          const masked = group1.substring(0, 4) + '*'.repeat(group1.length - 8) + group1.substring(group1.length - 4);
          return match.replace(group1, masked);
        } else if (group1) {
          // For short strings, mask everything except first character
          const masked = group1.charAt(0) + '*'.repeat(group1.length - 1);
          return match.replace(group1, masked);
        }
        // For non-capturing patterns, mask alphanumeric characters
        return match.replace(/[a-zA-Z0-9]/g, '*');
      });
      content = newContent;
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`Sanitized: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error sanitizing ${filePath}:`, error.message);
    return false;
  }
}

function sanitizeDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return;
  }
  
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  let totalSanitized = 0;
  
  files.forEach(file => {
    const fullPath = path.join(dirPath, file.name);
    
    if (file.isDirectory()) {
      totalSanitized += sanitizeDirectory(fullPath);
    } else if (file.name.endsWith('.html')) {
      if (sanitizeFile(fullPath)) {
        totalSanitized++;
      }
    }
  });
  
  return totalSanitized;
}

// Main execution
const debugCapturesDir = './rpa_debug_captures';
console.log('Starting debug capture sanitization...');

const sanitizedCount = sanitizeDirectory(debugCapturesDir);
console.log(`Sanitization complete. ${sanitizedCount} files modified.`);

if (sanitizedCount === 0) {
  console.log('No sensitive patterns found or files already sanitized.');
}