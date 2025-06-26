import { chromium, Browser, Page } from 'playwright';
import OpenAI from 'openai';
import { execSync } from 'child_process';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get system Chromium path dynamically
function getChromiumPath(): string {
  try {
    return execSync('which chromium', { encoding: 'utf8' }).trim();
  } catch {
    // Fallback paths
    return '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }
}

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

      IMPORTANT: This is a Spanish ERP system (SINCO). The login page uses Spanish labels:
      - Username field: Look for "Usuario" label or the first visible text input field
      - Password field: Look for "Contraseña" label or input[type="password"]
      - Login button: Look for "Iniciar sesión" button or form submit button
      
      Use these robust selector strategies (the system will automatically try fallbacks):
      - For username: Use 'input[name*="user"]' (fallbacks will handle Spanish variants)
      - For password: Use 'input[type="password"]' 
      - For login button: Use 'button[type="submit"]' or 'input[type="submit"]'
      - For navigation/modules: Use text-based selectors like '*:has-text("FE")' instead of href selectors
      
      CRITICAL NAVIGATION NOTES:
      - SINCO uses JavaScript-rendered sidebar navigation (NOT standard <a> tags)
      - Module links are typically span, div, or button elements with text content
      - Use text-based selectors like '*:has-text("FE")' for module navigation
      - Avoid href-based selectors for navigation elements
      
      CRITICAL: Add wait steps after each action (minimum 5000ms) as SINCO pages load slowly.

      Create a detailed step-by-step automation script. Consider common ERP workflows like:
      - Login process (with Spanish interface)
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
            "timeout": 15000,
            "description": "Human readable description of this step"
          }
        ],
        "metadata": {
          "taskDescription": "${taskDescription}",
          "estimatedDuration": 45000,
          "complexity": "low|medium|high"
        }
      }

      Important guidelines:
      1. Always start with navigation to the base URL
      2. Include login steps using the provided credentials with Spanish field detection
      3. Add generous wait steps after clicks and navigation (minimum 5000ms for SINCO)
      4. Take screenshots at key points for debugging
      5. Handle common errors and timeouts with retries
      6. Extract relevant data when needed
      7. Use longer timeouts (minimum 30000ms) for element detection
      8. For SINCO specifically: wait after page load, then find first text input for username
      9. Always add a wait step before attempting login after filling credentials
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
        executablePath: getChromiumPath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
    const timeout = step.timeout || 15000;

    switch (step.action) {
      case 'navigate':
        const url = step.value || connection.baseUrl;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait for page to stabilize
        await page.waitForTimeout(3000);
        break;

      case 'click':
        if (!step.selector) throw new Error('Selector required for click action');
        const clickSelector = await this.waitForSelectorWithFallback(page, step.selector, timeout);
        await page.click(clickSelector);
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

        const typeSelector = await this.waitForSelectorWithFallback(page, step.selector, timeout);
        // Clear field first, then type
        await page.fill(typeSelector, '');
        await page.type(typeSelector, valueToType, { delay: 100 });
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
          const extractSelector = await this.waitForSelectorWithFallback(page, step.selector, timeout);
          const element = await page.locator(extractSelector);
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
        executablePath: getChromiumPath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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

  private async waitForSelectorWithFallback(page: Page, originalSelector: string, timeout: number): Promise<string> {
    // Try original selector first
    try {
      await page.waitForSelector(originalSelector, { timeout: timeout / 4 });
      return originalSelector;
    } catch (error) {
      console.warn(`Original selector failed: ${originalSelector}`);
    }

    // Generate comprehensive fallback selectors for Spanish ERP systems
    const fallbackSelectors: string[] = [];
    
    if (originalSelector.includes('username') || originalSelector.includes('user')) {
      fallbackSelectors.push(
        // Spanish specific selectors
        'input[name*="usuario" i]',
        'input[placeholder*="usuario" i]',
        'input[id*="usuario" i]',
        'input[name*="user" i]',
        'input[placeholder*="user" i]',
        'input[id*="user" i]',
        // Generic text inputs (try visible ones first)
        'input[type="text"]:visible',
        'input[type="email"]:visible',
        'input[type="text"]',
        'input[type="email"]',
        // Broader search
        'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
        // Look for first input in forms
        'form input:first-of-type',
        'form input[type="text"]:first-of-type'
      );
    }
    
    if (originalSelector.includes('password') || originalSelector.includes('pass')) {
      fallbackSelectors.push(
        'input[type="password"]',
        'input[name*="clave" i]',
        'input[name*="contrasena" i]',
        'input[name*="contraseña" i]',
        'input[name*="password" i]',
        'input[placeholder*="contraseña" i]',
        'input[placeholder*="password" i]',
        'input[id*="password" i]',
        'input[id*="clave" i]'
      );
    }

    if (originalSelector.includes('button') || originalSelector.includes('submit')) {
      fallbackSelectors.push(
        'button:has-text("Iniciar sesión")',
        'button:has-text("Iniciar")',
        'button:has-text("Login")',
        'button:has-text("Entrar")',
        'button:has-text("Acceder")',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:visible',
        'input[value*="Iniciar" i]',
        'input[value*="Login" i]',
        'form button:last-of-type'
      );
    }

    // Handle navigation elements and modules (like FE module)
    if (originalSelector.includes('href*=') || originalSelector.includes('FE') || originalSelector.includes('module')) {
      const moduleText = originalSelector.match(/href\*=['"]([^'"]*)['"]/)?.[1] || 'FE';
      fallbackSelectors.push(
        // JavaScript-based navigation - look for text content
        `*:has-text("${moduleText}")`,
        `span:has-text("${moduleText}")`,
        `div:has-text("${moduleText}")`,
        `button:has-text("${moduleText}")`,
        `li:has-text("${moduleText}")`,
        // Case variations
        `*:has-text("${moduleText.toUpperCase()}")`,
        `*:has-text("${moduleText.toLowerCase()}")`,
        // Look for clickable elements containing the text
        `[onclick*="${moduleText}" i]`,
        `[data-module*="${moduleText}" i]`,
        `[data-target*="${moduleText}" i]`,
        `[id*="${moduleText}" i]`,
        `[class*="${moduleText}" i]`,
        // Navigation specific selectors
        'nav *:visible',
        'aside *:visible',
        '.sidebar *:visible',
        '.menu *:visible',
        '.nav *:visible',
        // Look for elements with role attributes
        '[role="menuitem"]:visible',
        '[role="button"]:visible',
        '[role="link"]:visible',
        // Broader search for any clickable sidebar elements
        'aside button:visible',
        'aside span:visible',
        'aside div[onclick]:visible',
        'nav button:visible',
        'nav span:visible',
        'nav div[onclick]:visible',
        // Look for first clickable element in sidebar/nav
        'aside *:visible:first',
        'nav *:visible:first'
      );
    }

    // Try fallback selectors with individual timeouts
    for (const selector of fallbackSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: Math.max(2000, timeout / 8) });
        console.log(`Fallback selector worked: ${selector}`);
        return selector;
      } catch (error) {
        console.warn(`Fallback selector failed: ${selector}`);
      }
    }

    // If all selectors fail, throw the original error
    throw new Error(`Could not find element with selector: ${originalSelector} or any fallbacks`);
  }
}

export const erpAutomationService = new ERPAutomationService();