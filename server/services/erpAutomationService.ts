import { chromium, Browser, Page } from 'playwright';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
}

export interface ERPTask {
  id: number;
  connectionId: number;
  taskDescription: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface RPAScript {
  steps: RPAStep[];
  metadata: {
    taskDescription: string;
    estimatedDuration: number;
    complexity: 'low' | 'medium' | 'high';
  };
}

export interface RPAStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'extract';
  selector?: string;
  value?: string;
  timeout?: number;
  description: string;
}

export interface TaskResult {
  success: boolean;
  screenshots: string[];
  logs: string[];
  extractedData?: any;
  errorMessage?: string;
  executionTime: number;
}

class ERPAutomationService {
  private browser: Browser | null = null;

  async generateRPAScript(taskDescription: string, connection: ERPConnection): Promise<RPAScript> {
    const prompt = `
      You are an expert RPA (Robotic Process Automation) developer. Convert this natural language task into a structured RPA script for browser automation.

      Task: ${taskDescription}
      ERP System URL: ${connection.baseUrl}
      
      Create a detailed step-by-step automation script. Consider common ERP workflows like:
      - Login process
      - Navigation to specific modules
      - Form filling
      - File uploads
      - Data extraction
      - Report generation

      Respond in JSON format with this structure:
      {
        "steps": [
          {
            "action": "navigate|click|type|wait|screenshot|extract",
            "selector": "CSS selector or XPath (when applicable)",
            "value": "text to type or data to extract (when applicable)",
            "timeout": 5000,
            "description": "Human readable description of this step"
          }
        ],
        "metadata": {
          "taskDescription": "${taskDescription}",
          "estimatedDuration": 30000,
          "complexity": "low|medium|high"
        }
      }

      Important guidelines:
      1. Always start with navigation to the base URL
      2. Include login steps using the provided credentials
      3. Add wait steps after clicks and navigation
      4. Take screenshots at key points
      5. Handle common errors and timeouts
      6. Extract relevant data when needed
      7. Use robust selectors (prefer data attributes, then IDs, then classes)
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: "You are an expert RPA automation engineer. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const script = JSON.parse(response.choices[0].message.content!);
      return script;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate RPA script: ${errorMessage}`);
    }
  }

  async executeRPAScript(
    script: RPAScript, 
    connection: ERPConnection
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const screenshots: string[] = [];
    const logs: string[] = [];
    let extractedData: any = {};

    try {
      // Launch browser
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      logs.push('Browser launched successfully');

      // Execute each step
      for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i];
        logs.push(`Executing step ${i + 1}: ${step.description}`);

        try {
          await this.executeStep(page, step, connection, screenshots, extractedData);
          logs.push(`Step ${i + 1} completed successfully`);
        } catch (stepError) {
          const errorMessage = stepError instanceof Error ? stepError.message : 'Unknown error';
          logs.push(`Step ${i + 1} failed: ${errorMessage}`);
          throw stepError;
        }

        // Add delay between steps
        await page.waitForTimeout(1000);
      }

      await this.browser.close();
      this.browser = null;

      return {
        success: true,
        screenshots,
        logs,
        extractedData,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logs.push(`Execution failed: ${errorMessage}`);
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      return {
        success: false,
        screenshots,
        logs,
        errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executeStep(
    page: Page, 
    step: RPAStep, 
    connection: ERPConnection, 
    screenshots: string[], 
    extractedData: any
  ): Promise<void> {
    const timeout = step.timeout || 10000;

    switch (step.action) {
      case 'navigate':
        const url = step.value || connection.baseUrl;
        await page.goto(url, { waitUntil: 'networkidle', timeout });
        break;

      case 'click':
        if (!step.selector) throw new Error('Selector required for click action');
        await page.waitForSelector(step.selector, { timeout });
        await page.click(step.selector);
        break;

      case 'type':
        if (!step.selector || !step.value) throw new Error('Selector and value required for type action');
        
        // Handle special credential replacements
        let valueToType = step.value;
        if (step.value === '{{username}}') {
          valueToType = connection.username;
        } else if (step.value === '{{password}}') {
          valueToType = connection.password;
        }
        
        await page.waitForSelector(step.selector, { timeout });
        await page.fill(step.selector, valueToType);
        break;

      case 'wait':
        const waitTime = step.timeout || 3000;
        await page.waitForTimeout(waitTime);
        break;

      case 'screenshot':
        const screenshot = await page.screenshot({ 
          fullPage: true,
          type: 'png'
        });
        screenshots.push(screenshot.toString('base64'));
        break;

      case 'extract':
        if (!step.selector) throw new Error('Selector required for extract action');
        
        try {
          await page.waitForSelector(step.selector, { timeout });
          const element = await page.locator(step.selector);
          const text = await element.textContent();
          
          // Store extracted data with step description as key
          const dataKey = step.description.toLowerCase().replace(/\s+/g, '_');
          extractedData[dataKey] = text?.trim();
        } catch (extractError) {
          // Non-critical error - continue execution
          const errorMessage = extractError instanceof Error ? extractError.message : 'Unknown error';
          console.warn(`Extract failed for ${step.selector}: ${errorMessage}`);
        }
        break;

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  async testConnection(connection: ERPConnection): Promise<{ success: boolean; message?: string; details?: any }> {
    try {
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      
      // Test basic URL accessibility
      console.log(`Testing connection to: ${connection.baseUrl}`);
      const response = await page.goto(connection.baseUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      if (!response) {
        throw new Error('No response received from server');
      }
      
      const status = response.status();
      console.log(`Response status: ${status}`);
      
      if (status >= 400) {
        throw new Error(`Server returned error status: ${status}`);
      }
      
      // Wait for page to stabilize
      await page.waitForTimeout(2000);
      
      // Try to find common login elements to verify it's an ERP system
      const pageTitle = await page.title();
      const pageContent = await page.content();
      
      // Look for common ERP/login indicators
      const hasLoginForm = await page.locator('input[type="password"]').count() > 0;
      const hasUsernameField = await page.locator('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]').count() > 0;
      
      await this.browser.close();
      this.browser = null;
      
      const details = {
        status,
        title: pageTitle,
        hasLoginForm,
        hasUsernameField,
        url: connection.baseUrl
      };
      
      if (hasLoginForm && hasUsernameField) {
        return {
          success: true,
          message: 'Successfully connected to ERP system. Login form detected.',
          details
        };
      } else if (status < 400) {
        return {
          success: true,
          message: 'Successfully connected to URL, but login form not detected. Please verify this is the correct ERP login page.',
          details
        };
      } else {
        return {
          success: false,
          message: `Connection failed with status ${status}`,
          details
        };
      }
      
    } catch (error) {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('ERP connection test failed:', errorMessage);
      
      return {
        success: false,
        message: `Connection test failed: ${errorMessage}`,
        details: {
          error: errorMessage,
          url: connection.baseUrl
        }
      };
    }
  }
}

export const erpAutomationService = new ERPAutomationService();