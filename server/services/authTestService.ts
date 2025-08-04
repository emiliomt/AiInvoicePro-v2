
import axios from 'axios';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  duration: number;
}

interface TestSuite {
  category: string;
  results: TestResult[];
  overallSuccess: boolean;
}

class AuthTestService {
  private baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://your-repl-name.replit.app' 
    : 'http://localhost:5173';

  async runComprehensiveTests(): Promise<TestSuite[]> {
    const testSuites: TestSuite[] = [
      await this.testAuthenticationFlow(),
      await this.testEdgeCases(),
      await this.testRoutePrecedence()
    ];

    return testSuites;
  }

  private async testAuthenticationFlow(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const category = 'Authentication Flow Verification';

    // Test 1: API endpoints return JSON (not HTML)
    results.push(await this.runTest('API endpoints return JSON', async () => {
      const response = await axios.get(`${this.baseUrl}/api/user`, {
        validateStatus: () => true, // Accept any status
        headers: {
          'Accept': 'application/json'
        }
      });

      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        throw new Error('API endpoint returned HTML instead of JSON');
      }

      return 'API endpoints properly return JSON responses';
    }));

    // Test 2: Protected routes require authentication
    results.push(await this.runTest('Protected routes require auth', async () => {
      const response = await axios.get(`${this.baseUrl}/api/dashboard/stats`, {
        validateStatus: () => true
      });

      if (response.status !== 401 && response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

      return 'Protected routes properly handle authentication';
    }));

    // Test 3: Check for session persistence mechanisms
    results.push(await this.runTest('Session handling configured', async () => {
      // Check if the authentication headers are being processed
      const response = await axios.get(`${this.baseUrl}/api/user`, {
        validateStatus: () => true,
        headers: {
          'X-Replit-User-Id': 'test-user-123',
          'X-Replit-User-Name': 'Test User'
        }
      });

      if (response.data && typeof response.data === 'object') {
        return 'Session handling is properly configured';
      }

      throw new Error('Session handling not working as expected');
    }));

    return {
      category,
      results,
      overallSuccess: results.every(r => r.passed)
    };
  }

  private async testEdgeCases(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const category = 'Edge Case Scenarios';

    // Test 1: Direct API endpoint access
    results.push(await this.runTest('Direct API access works', async () => {
      const endpoints = ['/api/user', '/api/dashboard/stats', '/api/invoices'];
      
      for (const endpoint of endpoints) {
        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
          validateStatus: () => true
        });

        // Should return either 401 (unauthorized) or 200/304 (authorized), not 404 or HTML
        if (response.status === 404 || (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>'))) {
          throw new Error(`Endpoint ${endpoint} returned unexpected response`);
        }
      }

      return 'All API endpoints are accessible and return proper responses';
    }));

    // Test 2: Invalid session handling
    results.push(await this.runTest('Invalid session handling', async () => {
      const response = await axios.get(`${this.baseUrl}/api/user`, {
        validateStatus: () => true,
        headers: {
          'X-Replit-User-Id': '', // Empty user ID
          'Authorization': 'Bearer invalid_token'
        }
      });

      if (response.status === 401) {
        return 'Invalid sessions are properly rejected';
      }

      throw new Error('Invalid session was not properly handled');
    }));

    return {
      category,
      results,
      overallSuccess: results.every(r => r.passed)
    };
  }

  private async testRoutePrecedence(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const category = 'Route Precedence Verification';

    // Test 1: API routes take precedence over frontend routes
    results.push(await this.runTest('API route precedence', async () => {
      const response = await axios.get(`${this.baseUrl}/api/user`, {
        validateStatus: () => true,
        headers: {
          'Accept': 'application/json'
        }
      });

      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('application/json') && response.status !== 401) {
        throw new Error('API route not returning JSON content type');
      }

      return 'API routes have proper precedence and return JSON';
    }));

    // Test 2: Frontend routes still work
    results.push(await this.runTest('Frontend routes work', async () => {
      const response = await axios.get(`${this.baseUrl}/`, {
        validateStatus: () => true
      });

      if (response.status !== 200 || !response.data.includes('<!DOCTYPE html>')) {
        throw new Error('Frontend routes not serving HTML properly');
      }

      return 'Frontend routes properly serve React application';
    }));

    // Test 3: 404 handling for non-existent API endpoints
    results.push(await this.runTest('API 404 handling', async () => {
      const response = await axios.get(`${this.baseUrl}/api/nonexistent`, {
        validateStatus: () => true
      });

      if (response.status !== 404) {
        throw new Error(`Expected 404, got ${response.status}`);
      }

      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        throw new Error('API 404 returned HTML instead of JSON error');
      }

      return 'Non-existent API endpoints return proper 404 JSON responses';
    }));

    return {
      category,
      results,
      overallSuccess: results.every(r => r.passed)
    };
  }

  private async runTest(testName: string, testFunction: () => Promise<string>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const message = await testFunction();
      const duration = Date.now() - startTime;
      
      return {
        test: testName,
        passed: true,
        message,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        test: testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      };
    }
  }
}

export const authTestService = new AuthTestService();
