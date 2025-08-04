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
  const { data: user, isLoading, error, refetch } = useQuery<User | null>({
    queryKey: ['/api/user'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/user', {
          credentials: 'include', // Use cookies instead of localStorage tokens
          headers: {
            'Accept': 'application/json',
          },
        });
        
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
        // Log once and return null to prevent loops
        if (err.status === 401 || err.message.includes('401')) {
          return null;
        }
        console.error('Auth error:', err.message || 'Unauthorized - please log in again');
        return null;
      }
    },
    retry: false, // Don't retry authentication failures to prevent loops
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  return { user, isLoading, error, refetch };
}