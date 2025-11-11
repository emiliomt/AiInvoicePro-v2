import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export class CredentialManager {
  private encryptionKey: Buffer;
  
  constructor(masterKey?: string) {
    // Use environment variable or provided master key
    const key = masterKey || process.env.ENCRYPTION_MASTER_KEY;
    
    // In production, require a proper encryption key
    if (process.env.NODE_ENV === 'production' && !key) {
      throw new Error(
        '[CredentialManager] ENCRYPTION_MASTER_KEY environment variable is required in production. ' +
        'Generate a secure key and set it before deployment.'
      );
    }
    
    // Use a default key only in development
    const finalKey = key || 'default-dev-key-change-in-production';
    
    if (!key && process.env.NODE_ENV !== 'production') {
      console.warn('[CredentialManager] Using default encryption key in development. Set ENCRYPTION_MASTER_KEY for production.');
    }
    
    // Derive a proper encryption key from the master key
    this.encryptionKey = crypto.pbkdf2Sync(finalKey, 'salt', ITERATIONS, KEY_LENGTH, 'sha512');
  }
  
  /**
   * Encrypt sensitive credentials
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine iv + encrypted + tag
      const combined = Buffer.concat([
        iv,
        Buffer.from(encrypted, 'hex'),
        tag
      ]);
      
      return combined.toString('base64');
    } catch (error: any) {
      console.error('[CredentialManager] Encryption failed:', error.message);
      throw new Error('Failed to encrypt credentials');
    }
  }
  
  /**
   * Decrypt encrypted credentials
   */
  decrypt(ciphertext: string): string {
    try {
      const combined = Buffer.from(ciphertext, 'base64');
      
      const iv = combined.subarray(0, IV_LENGTH);
      const tag = combined.subarray(combined.length - TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error: any) {
      console.error('[CredentialManager] Decryption failed:', error.message);
      throw new Error('Failed to decrypt credentials');
    }
  }
  
  /**
   * Securely hash a credential (one-way)
   */
  hash(value: string): string {
    return crypto
      .createHash('sha256')
      .update(value)
      .digest('hex');
  }
  
  /**
   * Generate a random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
  
  /**
   * Mask sensitive data for logging
   */
  mask(value: string, visibleChars: number = 4): string {
    if (!value || value.length <= visibleChars) {
      return '***';
    }
    
    const masked = '*'.repeat(value.length - visibleChars);
    return masked + value.slice(-visibleChars);
  }
  
  /**
   * Validate credential strength
   */
  validateStrength(password: string): {
    isValid: boolean;
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 0;
    
    // Length check
    if (password.length >= 8) score += 25;
    else issues.push('Password should be at least 8 characters');
    
    // Complexity checks
    if (/[a-z]/.test(password)) score += 15;
    else issues.push('Add lowercase letters');
    
    if (/[A-Z]/.test(password)) score += 15;
    else issues.push('Add uppercase letters');
    
    if (/[0-9]/.test(password)) score += 15;
    else issues.push('Add numbers');
    
    if (/[^a-zA-Z0-9]/.test(password)) score += 30;
    else issues.push('Add special characters');
    
    return {
      isValid: score >= 70,
      score,
      issues
    };
  }
}

// Singleton instance
export const credentialManager = new CredentialManager();
