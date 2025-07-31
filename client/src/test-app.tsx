import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Simple test app to isolate the issue
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function TestApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Test App - No Errors
          </h1>
          <p className="text-gray-600">
            If you see this, the basic React setup is working.
          </p>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default TestApp;