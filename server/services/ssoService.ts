import crypto from 'crypto';
import { storage } from '../storage';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

export class SSOService {
  private readonly redirectUri = `${process.env.BASE_URL || 'http://localhost:5000'}/api/rpa/oauth/callback`;

  /**
   * Initialize OAuth2 authorization flow
   */
  async initializeOAuth(connectionId: number, oauthConfig: OAuthConfig): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state temporarily for validation
    await this.storeOAuthState(connectionId, state);
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: oauthConfig.clientId,
      redirect_uri: this.redirectUri,
      scope: oauthConfig.scope || 'read',
      state: state,
    });

    return `${oauthConfig.authUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth2 callback and exchange code for tokens
   */
  async handleOAuthCallback(code: string, state: string): Promise<{ connectionId: number; success: boolean; error?: string }> {
    try {
      // Validate state and get connection info
      const connectionId = await this.validateOAuthState(state);
      if (!connectionId) {
        return { connectionId: 0, success: false, error: 'Invalid state parameter' };
      }

      const connection = await storage.getErpConnection(connectionId);
      if (!connection || !connection.oauthConfig) {
        return { connectionId, success: false, error: 'Connection not found or missing OAuth config' };
      }

      const oauthConfig = connection.oauthConfig as OAuthConfig;

      // Exchange authorization code for access token
      const tokenResponse = await this.exchangeCodeForTokens(code, oauthConfig);
      
      // Store tokens securely
      await storage.updateErpConnectionTokens(connectionId, {
        accessToken: this.encryptToken(tokenResponse.access_token),
        refreshToken: tokenResponse.refresh_token ? this.encryptToken(tokenResponse.refresh_token) : null,
        tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
      });

      // Update connection status
      await storage.updateErpConnectionStatus(connectionId, 'active', null);

      return { connectionId, success: true };
    } catch (error) {
      console.error('OAuth callback error:', error);
      return { connectionId: 0, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(connectionId: number): Promise<boolean> {
    try {
      const connection = await storage.getErpConnection(connectionId);
      if (!connection || !connection.refreshToken || !connection.oauthConfig) {
        return false;
      }

      const oauthConfig = connection.oauthConfig as OAuthConfig;
      const refreshToken = this.decryptToken(connection.refreshToken);

      const response = await fetch(oauthConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${oauthConfig.clientId}:${oauthConfig.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokenResponse: TokenResponse = await response.json();

      // Update tokens
      await storage.updateErpConnectionTokens(connectionId, {
        accessToken: this.encryptToken(tokenResponse.access_token),
        refreshToken: tokenResponse.refresh_token ? this.encryptToken(tokenResponse.refresh_token) : connection.refreshToken,
        tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
      });

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      await storage.updateErpConnectionStatus(connectionId, 'error', `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(connectionId: number): Promise<string | null> {
    const connection = await storage.getErpConnection(connectionId);
    if (!connection || !connection.accessToken) {
      return null;
    }

    // Check if token is expired
    if (connection.tokenExpiresAt && new Date() >= connection.tokenExpiresAt) {
      const refreshed = await this.refreshAccessToken(connectionId);
      if (!refreshed) {
        return null;
      }
      
      // Get updated connection
      const updatedConnection = await storage.getErpConnection(connectionId);
      return updatedConnection?.accessToken ? this.decryptToken(updatedConnection.accessToken) : null;
    }

    return this.decryptToken(connection.accessToken);
  }

  /**
   * Test SSO connection
   */
  async testSSOConnection(connectionId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = await this.getValidAccessToken(connectionId);
      if (!accessToken) {
        return { success: false, error: 'No valid access token available' };
      }

      const connection = await storage.getErpConnection(connectionId);
      if (!connection || !connection.connectionConfig) {
        return { success: false, error: 'Connection configuration not found' };
      }

      const config = connection.connectionConfig as any;
      const testEndpoint = config.endpoint || config.testEndpoint;
      
      if (!testEndpoint) {
        return { success: false, error: 'No test endpoint configured' };
      }

      // Test API call with access token
      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        await storage.updateErpConnectionStatus(connectionId, 'active', null);
        return { success: true };
      } else {
        const error = `Test failed: ${response.status} ${response.statusText}`;
        await storage.updateErpConnectionStatus(connectionId, 'error', error);
        return { success: false, error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await storage.updateErpConnectionStatus(connectionId, 'error', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private async exchangeCodeForTokens(code: string, oauthConfig: OAuthConfig): Promise<TokenResponse> {
    const response = await fetch(oauthConfig.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${oauthConfig.clientId}:${oauthConfig.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return await response.json();
  }

  private async storeOAuthState(connectionId: number, state: string): Promise<void> {
    // Store state with expiration (10 minutes)
    const expiration = new Date(Date.now() + 10 * 60 * 1000);
    await storage.storeOAuthState(state, connectionId, expiration);
  }

  private async validateOAuthState(state: string): Promise<number | null> {
    return await storage.validateOAuthState(state);
  }

  private encryptToken(token: string): string {
    const algorithm = 'aes-256-gcm';
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-gcm';
    const key = this.getEncryptionKey();
    const [ivHex, encrypted] = encryptedToken.split(':');
    
    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private getEncryptionKey(): string {
    return process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production';
  }
}

export const ssoService = new SSOService();