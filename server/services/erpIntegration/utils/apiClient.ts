interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class APIClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private retryConfig: RetryConfig;
  
  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    retryConfig?: Partial<RetryConfig>
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders
    };
    this.retryConfig = {
      maxRetries: retryConfig?.maxRetries ?? 3,
      initialDelay: retryConfig?.initialDelay ?? 1000,
      maxDelay: retryConfig?.maxDelay ?? 10000,
      backoffMultiplier: retryConfig?.backoffMultiplier ?? 2
    };
  }
  
  async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = 30000,
      retries = this.retryConfig.maxRetries
    } = options;
    
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...headers
      },
      signal: AbortSignal.timeout(timeout)
    };
    
    if (body) {
      if (typeof body === 'object' && !(body instanceof FormData)) {
        fetchOptions.body = JSON.stringify(body);
      } else {
        fetchOptions.body = body;
      }
    }
    
    let lastError: Error | null = null;
    let delay = this.retryConfig.initialDelay;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        
        // Handle HTTP errors
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP ${response.status}: ${response.statusText}. ${errorText}`
          );
        }
        
        // Parse response
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json() as T;
        } else if (contentType?.includes('text/')) {
          return await response.text() as T;
        } else {
          // Return buffer for binary data
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer) as T;
        }
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (
          error.name === 'AbortError' || 
          error.message.includes('HTTP 4') // 4xx errors are client errors, don't retry
        ) {
          throw error;
        }
        
        // If this was the last attempt, throw the error
        if (attempt === retries) {
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        console.log(
          `[APIClient] Request failed (attempt ${attempt + 1}/${retries + 1}), ` +
          `retrying in ${delay}ms...`,
          error.message
        );
        
        await this.sleep(delay);
        delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelay);
      }
    }
    
    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Request failed after all retries');
  }
  
  async get<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }
  
  async post<T>(
    endpoint: string,
    body?: any,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }
  
  async put<T>(
    endpoint: string,
    body?: any,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }
  
  async delete<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
  
  async patch<T>(
    endpoint: string,
    body?: any,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }
  
  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }
  
  removeDefaultHeader(key: string): void {
    delete this.defaultHeaders[key];
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
