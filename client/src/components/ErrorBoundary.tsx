
import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
    
    // Log additional context for debugging
    console.error('Component stack:', errorInfo.componentStack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Send error to monitoring service if available
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: false
      });
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} resetError={this.resetError} />;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-6">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={this.resetError}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Try Again
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 text-xs text-red-600 bg-red-50 p-3 rounded border overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.error.stack && (
                    <>
                      <br /><br />
                      <strong>Stack Trace:</strong><br />
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Specific error boundary for validation rules
export const ValidationRulesErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fallback = ({ error, resetError }: { error: Error; resetError: () => void }) => (
    <div className="p-6 text-center">
      <div className="text-red-500 text-4xl mb-4">⚠️</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Validation Rules Error</h3>
      <p className="text-gray-600 mb-4">
        There was an error loading the validation rules component.
      </p>
      <div className="space-y-3">
        <button
          onClick={resetError}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors mr-3"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-sm text-gray-500">
            Error Details
          </summary>
          <pre className="mt-2 text-xs text-red-600 bg-red-50 p-3 rounded border overflow-auto max-h-32">
            {error.toString()}
          </pre>
        </details>
      )}
    </div>
  );

  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundary;
