import { chromium, Browser, Page } from 'playwright';
import OpenAI from 'openai';
import { execSync } from 'child_process';
import { progressTracker } from './progressTracker';

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
      - After clicking FE module, wait for page to fully load before looking for sub-menu items
      - Sub-menu items like "Documentos recibidos" may appear in main content area, not sidebar
      - Use longer waits (10-15 seconds) after module navigation clicks

      CRITICAL: Add wait steps after each action (minimum 5000ms) as SINCO pages load slowly.
      EXTRA CRITICAL: After clicking any module (like FE), add 10+ second wait before next action.

      Create a detailed step-by-step automation script. Consider common ERP workflows like:
      - Login process (with Spanish interface)
      - Navigation to specific modules
      - Form filling
      - File uploads
      - Data extraction
      - Report generation

      IMPORTANT: Include screenshot steps at key points for debugging:
      - After successful login
      - After navigating to each module
      - Before and after clicking important elements
      - After completing data extraction
      - When errors occur

      Respond in JSON format with this structure:
      {
        "steps": [
          {
            "action": "navigate|click|type|wait|screenshot|extract",
            "selector": "CSS selector or XPath (when applicable)",
            "value": "text to type or data to extract (when applicable)",
            "timeout": 8000,
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
      3. Add smart wait steps after clicks and navigation (2-3 seconds for most actions)
      4. Take screenshots at key points for debugging
      5. Handle common errors and timeouts with retries
      6. Extract relevant data when needed
      7. Use shorter, adaptive timeouts (5-15 seconds) for element detection
      8. For SINCO specifically: wait after page load, then find first text input for username
      9. Add brief wait step before attempting login after filling credentials
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
    connection: ERPConnection,
    userId?: string,
    taskId?: number
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const screenshots: string[] = [];
    const logs: string[] = [];
    let extractedData: any = {};
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Global timeout (15 minutes for better responsiveness)
    const globalTimeoutPromise = new Promise<TaskResult>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutMessage = 'RPA script execution timed out after 15 minutes';
        logs.push(timeoutMessage);
        console.error('Task timeout:', timeoutMessage);

        if (this.browser) {
          this.browser.close().catch(closeError => {
            console.warn('Failed to close browser after timeout:', closeError);
          });
          this.browser = null;
        }

        reject(new Error(timeoutMessage));
      }, 15 * 60 * 1000); // 15 minutes
    });

    // Wrap the main execution in Promise.race to handle timeout
    const executionPromise = this.executeScriptWithTimeout(script, connection, userId, taskId, screenshots, logs, extractedData, startTime);
    
    try {
      const result = await Promise.race([executionPromise, globalTimeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      return result;
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logs.push(`Execution failed: ${errorMessage}`);

      if (this.browser) {
        try {
          await this.browser.close();
        } catch (closeError) {
          console.warn('Failed to close browser:', closeError);
        }
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

  private async executeScriptWithTimeout(
    script: RPAScript, 
    connection: ERPConnection,
    userId: string | undefined,
    taskId: number | undefined,
    screenshots: string[],
    logs: string[],
    extractedData: any,
    startTime: number
  ): Promise<TaskResult> {
    try {
      // Launch browser with performance optimizations and debugging
      logs.push('Launching browser with optimizations...');
      this.browser = await chromium.launch({ 
        headless: true,
        executablePath: getChromiumPath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images', // Disable images for faster loading
          '--disable-javascript-harmony-shipping',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-web-security', // Help with CORS issues
          '--disable-features=VizDisplayCompositor',
          '--timeout=60000' // 60 second timeout
        ]
      });

      const context = await this.browser.newContext({
        viewport: { width: 1366, height: 768 }, // Smaller viewport for faster rendering
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ignoreHTTPSErrors: true, // Ignore SSL errors to prevent hanging
        javaScriptEnabled: true,
        acceptDownloads: false, // Disable downloads to prevent hanging
      });

      const page = await context.newPage();
      
      // Block unnecessary resources for faster loading
      await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
      
      logs.push('Browser launched successfully with optimizations');

      // Take initial screenshot
      try {
        const initialScreenshot = await page.screenshot({ 
          fullPage: true,
          type: 'png'
        });
        screenshots.push(initialScreenshot.toString('base64'));
        logs.push('Initial screenshot captured');
      } catch (screenshotError) {
        console.warn('Initial screenshot failed:', screenshotError);
      }

      // Send task start notification
      if (userId && taskId) {
        progressTracker.sendTaskStart(userId, taskId, script.steps.length, `Starting ERP automation: ${script.metadata.taskDescription}`);
      }

      // Execute each step with timeout protection
      for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i];
        const stepMessage = `Step ${i + 1}/${script.steps.length}: ${step.description}`;
        logs.push(`Executing ${stepMessage}`);
        
        // Send progress update for each step
        if (userId && taskId) {
          progressTracker.sendStepUpdate(userId, taskId, i + 1, script.steps.length, stepMessage);
        }

        // Step-level timeout (1 minute per step maximum to prevent hanging)
        const stepPromise = this.executeStep(page, step, connection, screenshots, extractedData, logs);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Step ${i + 1} timed out after 1 minute`)), 60000);
        });

        try {
          await Promise.race([stepPromise, timeoutPromise]);
          logs.push(`Step ${i + 1} completed successfully`);

          // Take automatic screenshot after important steps (optimized)
          if (step.action === 'click' || step.action === 'navigate' || step.action === 'type') {
            try {
              await page.waitForTimeout(1000); // Wait for UI to stabilize
              const screenshot = await page.screenshot({ 
                fullPage: false, // Viewport only for speed
                type: 'png',
                quality: 80 // Reduce quality for speed
              });
              const base64Screenshot = screenshot.toString('base64');
              screenshots.push(base64Screenshot);
              logs.push(`Auto-screenshot captured after step ${i + 1}`);
            } catch (screenshotError) {
              console.warn('Auto-screenshot failed:', screenshotError);
            }
          }
        } catch (stepError) {
          clearTimeout(stepTimeout);

          // Take screenshot on error for debugging
          try {
            const errorScreenshot = await page.screenshot({ 
              fullPage: true,
              type: 'png'
            });
            const base64Screenshot = errorScreenshot.toString('base64');
            screenshots.push(base64Screenshot);
            logs.push(`Error screenshot captured for step ${i + 1}`);
          } catch (screenshotError) {
            console.warn('Error screenshot failed:', screenshotError);
          }

          const errorMessage = stepError instanceof Error ? stepError.message : 'Unknown error';
          logs.push(`Step ${i + 1} failed: ${errorMessage}`);

          // For extraction failures, continue with other steps instead of failing completely
          if (step.action === 'extract') {
            logs.push(`Continuing with remaining steps despite extraction failure`);
            continue;
          }

          throw stepError;
        }

        // Add minimal delay between steps
        await page.waitForTimeout(300);
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
        try {
          await this.browser.close();
        } catch (closeError) {
          console.warn('Failed to close browser:', closeError);
        }
        this.browser = null;
      }

      throw error; // Re-throw to be handled by the main method
    }
  }

  private async executeStep(
    page: Page, 
    step: RPAStep, 
    connection: ERPConnection, 
    screenshots: string[], 
    extractedData: any,
    logs: string[]
  ): Promise<void> {
    const timeout = step.timeout || 8000;

    switch (step.action) {
      case 'navigate':
        const url = step.value || connection.baseUrl;
        logs.push(`Navigating to: ${url}`);
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          logs.push(`Navigation successful - page loaded`);
        } catch (navError) {
          logs.push(`Navigation failed, trying networkidle: ${navError}`);
          await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
        }
        
        // Wait for page to stabilize and check if it actually loaded
        await page.waitForTimeout(2000);
        const pageTitle = await page.title();
        logs.push(`Page title: ${pageTitle}`);
        
        // Verify we're not stuck on an error page
        const pageContent = await page.textContent('body');
        if (pageContent?.includes('Error') || pageContent?.includes('404')) {
          throw new Error(`Page loaded with error content: ${pageContent.substring(0, 100)}`);
        }
        break;

      case 'click':
        if (!step.selector) throw new Error('Selector required for click action');
        const clickSelector = await this.waitForSelectorWithFallback(page, step.selector, timeout);

        // For SINCO navigation clicks, add smart wait and handling
        if (step.description.toLowerCase().includes('module') || step.description.toLowerCase().includes('fe')) {
          // Click and wait for navigation to complete
          await page.click(clickSelector);
          // Wait for any navigation or dynamic content loading
          await page.waitForTimeout(2000);
          // Wait for network to be idle after navigation
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
            console.warn('Network idle timeout - continuing anyway');
          });
        } else {
          await page.click(clickSelector);
          // Brief wait after regular clicks
          await page.waitForTimeout(500);
        }
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
        try {
          console.log('Taking screenshot...');
          const screenshot = await page.screenshot({ 
            fullPage: true,
            type: 'png'
          });
          const base64Screenshot = screenshot.toString('base64');
          screenshots.push(base64Screenshot);
          console.log(`Screenshot captured (${base64Screenshot.length} bytes)`);
        } catch (screenshotError) {
          console.error('Screenshot failed:', screenshotError);
          logs.push(`Screenshot failed: ${screenshotError instanceof Error ? screenshotError.message : 'Unknown error'}`);
        }
        break;

      case 'extract':
        if (!step.selector) throw new Error('Selector required for extract action');

        try {
          // For table extractions, wait longer and add debugging
          if (step.selector.includes('table') || step.selector.includes('tr') || step.selector.includes('td')) {
            // Wait for tables to fully load
            await page.waitForTimeout(5000);

            // Debug: Check if any tables exist
            const tableCount = await page.locator('table').count();
            console.log(`Found ${tableCount} tables on page`);

            if (tableCount > 0) {
              // Debug: Get table content
              const tableContent = await page.locator('table').first().textContent();
              console.log(`First table content preview: ${tableContent?.substring(0, 200)}...`);
            }

            // Check for data grids or other table-like structures
            const gridCount = await page.locator('.grid, .datagrid, .datatable, [role="table"]').count();
            console.log(`Found ${gridCount} grid/datatable elements`);
          }

          const extractSelector = await this.waitForSelectorWithFallback(page, step.selector, timeout);
          const element = await page.locator(extractSelector);
          const text = await element.textContent();

          // Store extracted data with step description as key
          const dataKey = step.description.toLowerCase().replace(/\s+/g, '_');
          extractedData[dataKey] = text?.trim();

          console.log(`Successfully extracted data for ${dataKey}: ${text?.trim()?.substring(0, 100)}...`);
        } catch (extractError) {
          // Enhanced error logging for extract failures
          const errorMessage = extractError instanceof Error ? extractError.message : 'Unknown error';
          console.warn(`Extract failed for ${step.selector}: ${errorMessage}`);

          // Try to provide more context about what's available on the page
          try {
            const pageTitle = await page.title();
            const visibleText = await page.locator('body').textContent();
            console.log(`Page title: ${pageTitle}`);
            console.log(`Page contains text: ${visibleText?.substring(0, 300)}...`);
          } catch (debugError) {
            console.warn('Could not get page debug info');
          }

          // Re-throw the error so it can be handled at the step level
          throw extractError;
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
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--disable-features=TranslateUI'
        ]
      });

      const context = await this.browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ignoreHTTPSErrors: true,
        acceptDownloads: false
      });

      const page = await context.newPage();
      
      // Block resources for faster connection testing
      await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());

      // Test basic URL accessibility with faster timeout
      console.log(`Testing connection to: ${connection.baseUrl}`);
      const response = await page.goto(connection.baseUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      if (!response) {
        throw new Error('No response received from server');
      }

      const status = response.status();
      console.log(`Response status: ${status}`);

      if (status >= 400) {
        throw new Error(`Server returned error status: ${status}`);
      }

      // Wait for page to stabilize (reduced time)
      await page.waitForTimeout(2000);

      // Try to find common login elements to verify it's an ERP system
      const pageTitle = await page.title();
      console.log(`Page title: ${pageTitle}`);

      // Enhanced login form detection for SINCO
      const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
      const hasUsernameField = await page.locator('input[type="text"], input[type="email"], input[name*="user"], input[name*="usuario"], input[placeholder*="usuario"]').count() > 0;
      
      // Check for SINCO-specific elements
      const hasSincoElements = await page.locator('*:has-text("SINCO"), *:has-text("SincoDycon"), *:has-text("Usuario"), *:has-text("Contraseña")').count() > 0;
      
      // Test actual login with provided credentials
      let loginTestResult = null;
      if (hasPasswordField && hasUsernameField) {
        try {
          console.log('Testing login credentials...');
          
          // Find username field using comprehensive selectors
          const usernameSelector = await this.findUsernameField(page);
          const passwordSelector = await this.findPasswordField(page);
          
          if (usernameSelector && passwordSelector) {
            await page.fill(usernameSelector, connection.username);
            await page.fill(passwordSelector, connection.password);
            
            // Find and click login button
            const loginButtonSelector = await this.findLoginButton(page);
            if (loginButtonSelector) {
              await page.click(loginButtonSelector);
              await page.waitForTimeout(3000);
              
              // Check if login was successful
              const currentUrl = page.url();
              const hasError = await page.locator('*:has-text("Error"), *:has-text("Incorrect"), *:has-text("Invalid"), *:has-text("Usuario"), *:has-text("credenciales")').count() > 0;
              
              loginTestResult = {
                attempted: true,
                urlChanged: currentUrl !== connection.baseUrl,
                hasError: hasError,
                currentUrl: currentUrl
              };
            }
          }
        } catch (loginError) {
          console.warn('Login test failed:', loginError);
          loginTestResult = {
            attempted: true,
            error: loginError instanceof Error ? loginError.message : 'Unknown login error'
          };
        }
      }

      await this.browser.close();
      this.browser = null;

      const details = {
        status,
        title: pageTitle,
        hasLoginForm: hasPasswordField,
        hasUsernameField,
        hasSincoElements,
        loginTest: loginTestResult,
        url: connection.baseUrl
      };

      if (hasPasswordField && hasUsernameField) {
        if (loginTestResult?.attempted && !loginTestResult?.hasError && loginTestResult?.urlChanged) {
          return {
            success: true,
            message: 'Successfully connected to ERP system and login credentials appear to be working.',
            details
          };
        } else if (loginTestResult?.attempted && loginTestResult?.hasError) {
          return {
            success: false,
            message: 'Connection successful but login credentials appear to be invalid. Please check username and password.',
            details
          };
        } else {
          return {
            success: true,
            message: 'Successfully connected to ERP system. Login form detected but credentials not fully tested.',
            details
          };
        }
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

  private async findUsernameField(page: any): Promise<string | null> {
    const selectors = [
      'input[name*="usuario" i]',
      'input[placeholder*="usuario" i]',
      'input[id*="usuario" i]',
      'input[name*="user" i]',
      'input[placeholder*="user" i]',
      'input[type="text"]:visible',
      'input[type="email"]:visible',
      'form input:first-of-type'
    ];

    for (const selector of selectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          return selector;
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  private async findPasswordField(page: any): Promise<string | null> {
    const selectors = [
      'input[type="password"]',
      'input[name*="clave" i]',
      'input[name*="contrasena" i]',
      'input[name*="contraseña" i]',
      'input[placeholder*="contraseña" i]'
    ];

    for (const selector of selectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          return selector;
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  private async findLoginButton(page: any): Promise<string | null> {
    const selectors = [
      'button:has-text("Iniciar sesión")',
      'button:has-text("Iniciar")',
      'button:has-text("Login")',
      'button:has-text("Entrar")',
      'input[type="submit"]',
      'button[type="submit"]',
      'button:visible',
      'form button:last-of-type'
    ];

    for (const selector of selectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          return selector;
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  private async waitForSelectorWithFallback(page: Page, originalSelector: string, timeout: number): Promise<string> {
    // Try original selector first with shorter timeout
    try {
      await page.waitForSelector(originalSelector, { timeout: Math.min(timeout / 3, 2000) });
      console.log(`Original selector worked: ${originalSelector}`);
      return originalSelector;
    } catch (error) {
      console.warn(`Original selector failed: ${originalSelector}, trying fallbacks...`);
      
      // Take a debug screenshot to see current page state
      try {
        const debugScreenshot = await page.screenshot({ fullPage: false });
        console.log(`Debug screenshot taken (${debugScreenshot.length} bytes)`);
      } catch (screenshotError) {
        console.warn('Debug screenshot failed');
      }
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

    // Handle table selectors
    if (originalSelector.includes('table') || originalSelector.includes('tr') || originalSelector.includes('td')) {
      fallbackSelectors.push(
        // Basic table selectors
        'table:visible',
        'table',
        '.table:visible',
        '.table',
        '[role="table"]:visible',
        '[role="table"]',
        // Table rows
        'table tr:visible',
        'table tr',
        '.table tr:visible',
        '.table tr',
        'tbody tr:visible',
        'tbody tr',
        // Table cells
        'table td:visible',
        'table td',
        'table th:visible',
        'table th',
        '.table td:visible',
        '.table td',
        // Data tables (common in ERP systems)
        '.datatable:visible',
        '.data-table:visible',
        '.grid:visible',
        '.datagrid:visible',
        // Dynamic tables
        '[class*="table"]:visible',
        '[class*="grid"]:visible',
        '[id*="table"]:visible',
        '[id*="grid"]:visible'
      );
    }

    // Handle Spanish document column headers and links
    if (originalSelector.includes('N° Documento') || originalSelector.includes('Documento')) {
      fallbackSelectors.push(
        // Spanish document number variations
        'td:has-text("N° Documento") a',
        'td:has-text("N° Doc") a',
        'td:has-text("Nº Documento") a',
        'td:has-text("Nº Doc") a',
        'td:has-text("No. Documento") a',
        'td:has-text("No Documento") a',
        'td:has-text("Num Documento") a',
        'td:has-text("DOCUMENTO") a',
        'td:has-text("documento") a',
        'td:has-text("DOC") a',
        'td:has-text("doc") a',
        // Look for any links in table cells that might be documents
        'table td a:visible',
        'table td a',
        'tbody td a:visible',
        'tbody td a',
        'tr td a:visible',
        'tr td a',
        // Look for clickable document numbers/IDs
        'td a[href*="doc" i]:visible',
        'td a[href*="documento" i]:visible',
        'td a[onclick*="doc" i]:visible',
        'td a[onclick*="documento" i]:visible',
        // Look for any numeric links in tables (likely document IDs)
        'table a:visible',
        'table a',
        '.table a:visible',
        '.table a',
        // Broader search for any table content with links
        'table [role="link"]:visible',
        'table [role="button"]:visible',
        'table button:visible',
        'table span[onclick]:visible',
        'table div[onclick]:visible',
        // Column header search - find any table header then look for links in that column
        'th:has-text("Documento") ~ td a',
        'th:has-text("DOC") ~ td a',
        'th:has-text("N°") ~ td a',
        // Generic table cell with any clickable content
        'td:first-child a:visible',
        'td:nth-child(1) a:visible',
        'td:nth-child(2) a:visible',
        'td:nth-child(3) a:visible'
      );
    }

    // Handle Spanish document-related text selectors
    if (originalSelector.includes('Documentos') || originalSelector.includes('recibidos')) {
      const documentText = originalSelector.match(/has-text\(['"]([^'"]*)['"]\)/)?.[1] || 'Documentos recibidos';
      fallbackSelectors.push(
        // Try exact text variations
        `*:has-text("${documentText}")`,
        `*:has-text("Documentos recibidos")`,
        `*:has-text("Documentos Recibidos")`,
        `*:has-text("DOCUMENTOS RECIBIDOS")`,
        `*:has-text("documentos recibidos")`,
        // Partial text matches
        `*:has-text("Documentos")`,
        `*:has-text("DOCUMENTOS")`,
        `*:has-text("documentos")`,
        `*:has-text("Recibidos")`,
        `*:has-text("RECIBIDOS")`,
        `*:has-text("recibidos")`,
        // Look for menu items or links containing these words
        'a:has-text("Documentos")',
        'a:has-text("Recibidos")',
        'li:has-text("Documentos")',
        'li:has-text("Recibidos")',
        'button:has-text("Documentos")',
        'button:has-text("Recibidos")',
        'span:has-text("Documentos")',
        'span:has-text("Recibidos")',
        'div:has-text("Documentos")',
        'div:has-text("Recibidos")',
        // Look for any clickable elements after FE navigation
        'main *:visible',
        '.content *:visible',
        '.main *:visible',
        '#content *:visible',
        // Look for menu items or navigation after clicking FE
        'ul li:visible',
        'nav li:visible',
        'aside li:visible',
        '.menu li:visible',
        '.sidebar li:visible',
        // Look for any text containing document-related Spanish words
        '*[onclick]:has-text("Doc")',
        '*[onclick]:has-text("Rec")',
        '*:has-text("Doc"):visible',
        '*:has-text("Rec"):visible'
      );
    }

    // Try fallback selectors with faster timeouts (limit to first 10 most likely selectors)
    const prioritizedSelectors = fallbackSelectors.slice(0, 10);
    for (const selector of prioritizedSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: Math.min(1500, timeout / 6) });
        console.log(`Fallback selector worked: ${selector}`);
        return selector;
      } catch (error) {
        // Silent fail for faster execution
      }
    }

    // If all selectors fail, throw the original error
    throw new Error(`Could not find element with selector: ${originalSelector} or any fallbacks`);
  }
}

export const erpAutomationService = new ERPAutomationService();