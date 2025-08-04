// Enhanced ERP Automation Service with robust JSON parsing
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

  // Enhanced JSON parsing with multiple fallback strategies
  private parseJSONResponse(content: string): any {
    if (!content || content.trim() === '') {
      throw new Error('Empty response content');
    }

    // Strategy 1: Direct parsing
    try {
      return JSON.parse(content);
    } catch (error) {
      console.log('Direct JSON parsing failed, trying cleanup strategies...');
    }

    // Strategy 2: Remove markdown code blocks
    try {
      const cleanedContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*|\s*$/g, '');
      return JSON.parse(cleanedContent);
    } catch (error) {
      console.log('Markdown cleanup failed, trying content extraction...');
    }

    // Strategy 3: Extract JSON from mixed content
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.log('JSON extraction failed, trying line-by-line parsing...');
    }

    // Strategy 4: Find and extract valid JSON blocks
    try {
      const lines = content.split('\n');
      let jsonStart = -1;
      let jsonEnd = -1;
      let braceCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('{')) {
          if (jsonStart === -1) jsonStart = i;
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
        } else if (jsonStart !== -1) {
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
        }

        if (jsonStart !== -1 && braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonText = lines.slice(jsonStart, jsonEnd + 1).join('\n');
        return JSON.parse(jsonText);
      }
    } catch (error) {
      console.log('Line-by-line parsing failed, trying character cleanup...');
    }

    // Strategy 5: Remove common problematic characters
    try {
      const cleanedContent = content
        .replace(/[\u0000-\u0019]+/g, '') // Remove control characters
        .replace(/[\u00A0\u2000-\u200B\u2028-\u2029\u3000]/g, ' ') // Replace various spaces with regular space
        .replace(/[""]/g, '"') // Replace smart quotes
        .replace(/['']/g, "'") // Replace smart apostrophes
        .trim();

      // Try to find JSON structure
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.log('Character cleanup failed');
    }

    // If all strategies fail, create a default response
    console.error('All JSON parsing strategies failed. Content:', content.substring(0, 200));
    throw new Error(`Failed to parse JSON response. Content preview: ${content.substring(0, 100)}`);
  }

  // Enhanced RPA script generation with better error handling
  async generateRPAScript(taskDescription: string, connection: ERPConnection): Promise<RPAScript> {
    const prompt = `
      You are an expert RPA (Robotic Process Automation) developer. Convert this natural language task into a structured RPA script for browser automation.

      Task: ${taskDescription}
      ERP System URL: ${connection.baseUrl}

      INVOICE EXTRACTION SPECIFIC INSTRUCTIONS:
      ${taskDescription.includes('invoice') ? `
      - After login, navigate to "FE" (Facturación Electrónica) module
      - Look for "Documentos recibidos" or "Facturas recibidas" 
      - Find invoice tables with document numbers and download links
      - Extract invoice document IDs, numbers, dates, and amounts
      - Look for download buttons for XML and PDF files
      - Focus on finding clickable document links in table cells
      ` : ''}

      IMPORTANT: This is a Spanish ERP system (SINCO).
      EXTRA CRITICAL: After clicking any module (like FE), add 10+ second wait before next action.

      Create a detailed step-by-step automation script. Consider common ERP workflows like:
      - Login process (with Spanish interface)
      - Navigation to specific modules (especially FE for invoices)
      - Form filling
      - File uploads
      - Data extraction (especially from invoice tables)
      - Report generation
      - Invoice document downloading
      - Table data extraction for invoice lists

      IMPORTANT: Include screenshot steps at key points for debugging:
      - After successful login
      - After navigating to each module
      - Before and after clicking important elements
      - After completing data extraction
      - When errors occur

      CRITICAL: Respond ONLY with valid JSON. No explanations, no markdown, no additional text.

      Use this exact JSON structure:
      {
        "steps": [
          {
            "action": "navigate",
            "selector": "",
            "value": "",
            "timeout": 8000,
            "description": "Navigate to login page"
          }
        ],
        "metadata": {
          "taskDescription": "${taskDescription}",
          "estimatedDuration": 45000,
          "complexity": "medium"
        }
      }
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert RPA automation engineer. ALWAYS respond with valid JSON only. Never include explanations or markdown." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 3000,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Use enhanced JSON parsing
      const script = this.parseJSONResponse(content);

      // Validate the script structure
      if (!script.steps || !Array.isArray(script.steps)) {
        throw new Error('Invalid script structure: missing or invalid steps array');
      }

      if (!script.metadata) {
        script.metadata = {
          taskDescription: taskDescription,
          estimatedDuration: 45000,
          complexity: 'medium'
        };
      }

      // Validate each step
      for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i];
        if (!step.action || !step.description) {
          throw new Error(`Invalid step ${i}: missing action or description`);
        }

        // Set default timeout if missing
        if (!step.timeout) {
          step.timeout = 8000;
        }
      }

      return script;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Return a fallback script if generation fails
      console.error('RPA script generation failed:', errorMessage);

      return this.createFallbackScript(taskDescription, connection);
    }
  }

  // Fallback script for when AI generation fails
  private createFallbackScript(taskDescription: string, connection: ERPConnection): RPAScript {
    const isInvoiceTask = taskDescription.toLowerCase().includes('invoice') || 
                         taskDescription.toLowerCase().includes('factura');

    const steps: RPAStep[] = [
      {
        action: 'navigate',
        value: connection.baseUrl,
        timeout: 15000,
        description: 'Navigate to ERP login page'
      },
      {
        action: 'wait',
        timeout: 3000,
        description: 'Wait for page to load'
      },
      {
        action: 'screenshot',
        timeout: 1000,
        description: 'Take screenshot of login page'
      },
      {
        action: 'type',
        selector: 'input[name="username"], input[name="user"], #username, .username',
        value: connection.username,
        timeout: 5000,
        description: 'Enter username'
      },
      {
        action: 'type',
        selector: 'input[name="password"], #password, .password',
        value: connection.password,
        timeout: 5000,
        description: 'Enter password'
      },
      {
        action: 'click',
        selector: 'input[type="submit"], button[type="submit"], .login-btn, .btn-login',
        timeout: 5000,
        description: 'Click login button'
      },
      {
        action: 'wait',
        timeout: 5000,
        description: 'Wait for login to complete'
      },
      {
        action: 'screenshot',
        timeout: 1000,
        description: 'Take screenshot after login'
      }
    ];

    if (isInvoiceTask) {
      steps.push(
        {
          action: 'click',
          selector: 'a[href*="FE"], .module-fe, [data-module="FE"]',
          timeout: 10000,
          description: 'Click on FE (Facturación Electrónica) module'
        },
        {
          action: 'wait',
          timeout: 3000,
          description: 'Wait for FE module to expand'
        },
        {
          action: 'click',
          selector: 'a[href*="recibidos"], .documentos-recibidos',
          timeout: 10000,
          description: 'Click on Documentos recibidos'
        },
        {
          action: 'wait',
          timeout: 5000,
          description: 'Wait for invoice list to load'
        },
        {
          action: 'screenshot',
          timeout: 1000,
          description: 'Take screenshot of invoice list'
        },
        {
          action: 'extract',
          selector: 'table, .invoice-list, .document-table',
          timeout: 5000,
          description: 'Extract invoice data from table'
        }
      );
    }

    return {
      steps,
      metadata: {
        taskDescription: `Fallback script: ${taskDescription}`,
        estimatedDuration: 60000,
        complexity: 'medium'
      }
    };
  }

  // Enhanced script execution with better error handling
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

    // Global timeout (5 minutes for faster responsiveness)
    const globalTimeoutPromise = new Promise<TaskResult>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutMessage = 'RPA script execution timed out after 5 minutes';
        logs.push(timeoutMessage);
        console.error('Task timeout:', timeoutMessage);

        if (this.browser) {
          this.browser.close().catch(closeError => {
            console.warn('Failed to close browser after timeout:', closeError);
          });
          this.browser = null;
        }

        reject(new Error(timeoutMessage));
      }, 5 * 60 * 1000); // 5 minutes
    });

    try {
      logs.push('Starting RPA script execution...');
      logs.push(`Task: ${script.metadata.taskDescription}`);
      logs.push(`Steps to execute: ${script.steps.length}`);

      // Initialize browser
      await this.initializeBrowser();
      const page = await this.browser!.newPage();

      // Set page configurations
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      });

      // Execute each step with enhanced error handling
      for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i];
        logs.push(`Executing step ${i + 1}/${script.steps.length}: ${step.description}`);

        try {
          await this.executeStepWithRetry(page, step, connection, screenshots, extractedData, logs);
          logs.push(`✓ Step ${i + 1} completed successfully`);
        } catch (stepError) {
          const errorMessage = stepError instanceof Error ? stepError.message : 'Unknown step error';
          logs.push(`✗ Step ${i + 1} failed: ${errorMessage}`);

          // Take screenshot on error
          try {
            const screenshot = await page.screenshot({ encoding: 'base64' });
            screenshots.push(screenshot);
            logs.push('Error screenshot captured');
          } catch (screenshotError) {
            logs.push('Failed to capture error screenshot');
          }

          // Continue with next step for non-critical errors
          if (step.action !== 'navigate' && step.action !== 'click') {
            logs.push('Continuing with next step...');
            continue;
          } else {
            throw stepError; // Critical error, stop execution
          }
        }
      }

      await page.close();

      const executionTime = Date.now() - startTime;
      logs.push(`Script execution completed in ${executionTime}ms`);

      return {
        success: true,
        screenshots,
        logs,
        extractedData,
        executionTime
      };

    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
      logs.push(`Script execution failed: ${errorMessage}`);

      return {
        success: false,
        screenshots,
        logs,
        extractedData,
        errorMessage,
        executionTime: Date.now() - startTime
      };

    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      // Always clean up browser
      if (this.browser) {
        try {
          await this.browser.close();
          this.browser = null;
          logs.push('Browser cleaned up successfully');
        } catch (cleanupError) {
          logs.push('Browser cleanup failed');
        }
      }
    }
  }

  // Execute step with retry logic
  private async executeStepWithRetry(
    page: Page,
    step: RPAStep,
    connection: ERPConnection,
    screenshots: string[],
    extractedData: any,
    logs: string[]
  ): Promise<void> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.executeStep(page, step, connection, screenshots, extractedData, logs);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          logs.push(`Step attempt ${attempt} failed, retrying...`);
          await page.waitForTimeout(2000); // Wait before retry
        }
      }
    }

    // If all retries failed, throw the last error
    throw lastError;
  }

  // Enhanced step execution with better selector handling
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

        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });

        // Verify page loaded successfully
        const title = await page.title();
        logs.push(`Page loaded: ${title}`);
        break;

      case 'click':
        if (!step.selector) throw new Error('Selector required for click action');

        const clickElement = await this.waitForElementWithFallback(page, step.selector, timeout);
        await clickElement.click();

        // Wait after click
        await page.waitForTimeout(1000);
        break;

      case 'type':
        if (!step.selector || !step.value) {
          throw new Error('Selector and value required for type action');
        }

        const typeElement = await this.waitForElementWithFallback(page, step.selector, timeout);
        await typeElement.clear();
        await typeElement.fill(step.value);
        break;

      case 'wait':
        await page.waitForTimeout(timeout);
        break;

      case 'screenshot':
        try {
          const screenshot = await page.screenshot({ 
            encoding: 'base64',
            fullPage: false 
          });
          screenshots.push(screenshot);
          logs.push('Screenshot captured');
        } catch (screenshotError) {
          logs.push('Screenshot failed (continuing...)');
        }
        break;

      case 'extract':
        if (!step.selector) {
          logs.push('No selector provided for extraction, skipping...');
          break;
        }

        try {
          const elements = await page.$$(step.selector);
          const extractedText = await Promise.all(
            elements.map(el => el.textContent())
          );

          extractedData.extractedContent = extractedText.filter(text => text?.trim());
          logs.push(`Extracted ${extractedData.extractedContent.length} items`);
        } catch (extractError) {
          logs.push('Data extraction failed (continuing...)');
        }
        break;

      default:
        logs.push(`Unknown action: ${step.action}`);
    }
  }

  // Enhanced element waiting with multiple selector strategies
  private async waitForElementWithFallback(page: Page, selector: string, timeout: number) {
    const selectors = selector.split(', ').map(s => s.trim());

    for (const sel of selectors) {
      try {
        const element = await page.waitForSelector(sel, { timeout });
        if (element) return element;
      } catch (error) {
        continue; // Try next selector
      }
    }

    throw new Error(`None of the selectors found: ${selector}`);
  }

  // Initialize browser with better configuration
  private async initializeBrowser(): Promise<void> {
        try {
            if (this.browser) {
                await this.browser.close();
            }

            this.browser = await chromium.launch({
                headless: true,
                executablePath: getChromiumPath(),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-extensions',
                    '--disable-gpu',
                    '--no-first-run',
                    '--disable-default-apps',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ],
                timeout: 30000
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown browser error';
            throw new Error(`Failed to initialize browser: ${errorMessage}`);
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
          console.log(`🔐 Test connection - Using username: ${connection.username}`);
          console.log(`🔐 Test connection - Using password: ${connection.password}`);
          console.log(`🔐 Test connection - Password length: ${connection.password ? connection.password.length : 0}`);
          console.log(`🔐 Test connection - Password type: ${typeof connection.password}`);

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
        // Look for elementswith role attributes
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
                    '--disable-gpu',
                    '--no-first-run',
                    '--disable-default-apps',
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
                    console.log(`🔐 Test connection - Using username: ${connection.username}`);
                    console.log(`🔐 Test connection - Using password: ${connection.password}`);
                    console.log(`🔐 Test connection - Password length: ${connection.password ? connection.password.length : 0}`);
                    console.log(`🔐 Test connection - Password type: ${typeof connection.password}`);

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
}

export const erpAutomationService = new ERPAutomationService();