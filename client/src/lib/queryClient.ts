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
    const response = await fetch(url, config);

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

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        // Handle authentication errors
        if (error?.status === 401) {
          console.error('Authentication error:', 'invalid_request');
          console.error('Auth error:', 'Unauthorized - please log in again');
          localStorage.removeItem('auth_token');
          window.location.href = '/';
          return false;
        }
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) {
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
      retry: (failureCount, error: any) => {
        // Handle authentication errors in mutations
        if (error?.status === 401) {
          console.error('Authentication error:', 'invalid_request');
          console.error('Auth error:', 'Unauthorized - please log in again');
          localStorage.removeItem('auth_token');
          window.location.href = '/';
          return false;
        }
        return false;
      },
    },
  },
});