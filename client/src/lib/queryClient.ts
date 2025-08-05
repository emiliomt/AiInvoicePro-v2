import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export const apiRequest = async (method: string, url: string, data?: any): Promise<Response> => {
  const token = localStorage.getItem('authToken');

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, {
      ...config,
      credentials: 'include', // Ensure cookies are sent with requests
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    // Handle authentication errors
    if (response.status === 401) {
      console.warn('Authentication failed, clearing token and redirecting');
      localStorage.removeItem('authToken');
      window.location.href = '/api/login';
      throw new Error('Unauthorized - please log in again');
    }

    // Handle other HTTP errors
    if (!response.ok && response.status >= 500) {
      throw new Error(`Server error (${response.status}): Please try again later`);
    }

    // Additional check for HTML responses even with 200 status
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('❌ Received HTML with 200 status - authentication redirect');
      const htmlText = await response.text();
      console.error('HTML Response preview:', htmlText.substring(0, 200));
      throw new Error('Authentication failed: Received HTML page instead of JSON data');
    }

    return response;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Please check your internet connection');
    }

    // Re-throw other errors
    throw error;
  }
};

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    // Check if we got HTML instead of JSON (authentication redirect)
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('❌ Received HTML instead of JSON - likely authentication failure');
      const htmlText = await res.text();
      console.error('HTML Response preview:', htmlText.substring(0, 200));
      throw new Error(`Authentication failed: Received HTML login page instead of JSON (status: ${res.status})`);
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 404s or auth errors
        if (error?.status === 404 || error?.status === 401 || error?.status === 403) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false, // Prevent excessive refetching
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false, // Don't retry failed mutations to prevent cascading errors
    },
  },
});