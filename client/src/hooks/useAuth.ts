import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface User {
  id: string;
  username: string;
  name: string;
  profileImage: string;
  roles: string[];
  bio: string;
}

export function useAuth() {
  const { data: user, isLoading, error, refetch } = useQuery<User>({
    queryKey: ['/api/user'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/user');
        if (!response.ok) {
          if (response.status === 401) {
            // Return null for unauthorized users instead of throwing
            return null;
          }
          throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return data.user;
      } catch (err: any) {
        console.error('Auth error:', err.message || 'Unauthorized - please log in again');
        console.warn('Authentication failed, clearing token and redirecting');
        
        // For all authentication errors, return null instead of throwing
        // This prevents unhandled promise rejections
        return null;
      }
    },
    retry: false, // Don't retry authentication failures to prevent loops
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return { user, isLoading, error, refetch };
}