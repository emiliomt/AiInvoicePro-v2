import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Mock user data for testing - bypasses actual authentication
  const mockUser = {
    id: "test-user-123",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    profileImageUrl: null
  };

  return {
    user: mockUser,
    isLoading: false,
    isAuthenticated: true,
  };
}
