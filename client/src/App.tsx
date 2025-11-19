import React from "react";
import { Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/useAuth";
import ErrorBoundary from "@/components/ErrorBoundary";

// Pages
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Invoices from "@/pages/Invoices";
import Profile from "@/pages/Profile";
import Approvals from "@/pages/Approvals";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import PettyCash from "@/pages/PettyCash";
import ProjectValidation from "@/pages/ProjectValidation";
import ValidationRules from "@/pages/ValidationRules";
import POMatching from "@/pages/POMatching";
import PurchaseOrders from "@/pages/PurchaseOrders";
import ProjectMatcher from "@/pages/ProjectMatcher";
import VerifiedInvoices from "@/pages/VerifiedInvoices";
import InvoiceVerification from "@/pages/InvoiceVerification";
import AILearningDashboard from "@/pages/AILearningDashboard";
import LineItemClassification from "@/pages/LineItemClassification";
import BulkClassificationPage from "@/pages/BulkClassificationPage";
import ERPConnect from "@/pages/ERPConnect";
import RPADashboard from "@/pages/RPADashboard";
import AiWorkflow from "@/pages/AiWorkflow";
import InvoiceImporter from "@/pages/InvoiceImporter";
import InvoicePreview from "@/pages/InvoicePreview";
import InvoiceRejectionDebugger from "@/pages/InvoiceRejectionDebugger";
import Receipts from "@/pages/Receipts";
import SubmitReceipt from "@/pages/SubmitReceipt";
import ReceiptDetail from "@/pages/ReceiptDetail";
import NotFound from "@/pages/not-found";

// Import the existing query client from lib
import { queryClient } from "@/lib/queryClient";

const AppContent = React.memo(() => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Switch>
        <Route path="/">
          {user ? <Dashboard /> : <Landing />}
        </Route>
        <Route path="/dashboard">
          {user ? <Dashboard /> : <Landing />}
        </Route>
        <Route path="/invoices">
          {user ? <Invoices /> : <Landing />}
        </Route>
        <Route path="/invoices/:id/preview">
          {user ? <InvoicePreview /> : <Landing />}
        </Route>
        <Route path="/profile">
          {user ? <Profile /> : <Landing />}
        </Route>
        <Route path="/approvals">
          {user ? <Approvals /> : <Landing />}
        </Route>
        <Route path="/settings">
          {user ? <Settings /> : <Landing />}
        </Route>
        <Route path="/reports">
          {user ? <Reports /> : <Landing />}
        </Route>
        <Route path="/petty-cash">
          {user ? <PettyCash /> : <Landing />}
        </Route>
        <Route path="/project-validation">
          {user ? <ProjectValidation /> : <Landing />}
        </Route>
        <Route path="/validation-rules">
          {user ? <ValidationRules /> : <Landing />}
        </Route>
        <Route path="/po-matching">
          {user ? <POMatching /> : <Landing />}
        </Route>
        <Route path="/purchase-orders">
          {user ? <PurchaseOrders /> : <Landing />}
        </Route>
        <Route path="/project-matcher">
          {user ? <ProjectMatcher /> : <Landing />}
        </Route>
        <Route path="/verified-invoices">
          {user ? <VerifiedInvoices /> : <Landing />}
        </Route>
        <Route path="/invoice-verification">
          {user ? <InvoiceVerification /> : <Landing />}
        </Route>
        <Route path="/ai-learning">
          {user ? <AILearningDashboard /> : <Landing />}
        </Route>
        <Route path="/line-item-classification">
          {user ? <LineItemClassification /> : <Landing />}
        </Route>
        <Route path="/bulk-classification">
          {user ? <BulkClassificationPage /> : <Landing />}
        </Route>
        <Route path="/erp-connect">
          {user ? <ERPConnect /> : <Landing />}
        </Route>
        <Route path="/rpa-dashboard">
          {user ? <RPADashboard /> : <Landing />}
        </Route>
        <Route path="/ai-workflow">
          {user ? <AiWorkflow /> : <Landing />}
        </Route>
        <Route path="/invoice-importer">
          {user ? <InvoiceImporter /> : <Landing />}
        </Route>
        <Route path="/invoice-rejection-debugger">
          {user ? <InvoiceRejectionDebugger /> : <Landing />}
        </Route>
        <Route path="/rpa">
          {user ? <InvoiceImporter /> : <Landing />}
        </Route>
        <Route path="/receipts">
          {user ? <Receipts /> : <Landing />}
        </Route>
        <Route path="/receipts/:id">
          {user ? <ReceiptDetail /> : <Landing />}
        </Route>
        <Route path="/submit-receipt">
          {user ? <SubmitReceipt /> : <Landing />}
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
      <Toaster />
    </div>
  );
});

function App() {
  // Add comprehensive global error handling for unhandled promise rejections and errors
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);

      // Check if it's a WebSocket error (common cause of crashes)
      if (event.reason && typeof event.reason === 'object') {
        const reasonStr = String(event.reason);
        if (reasonStr.includes('WebSocket') || reasonStr.includes('Failed to construct') || reasonStr.includes('connection')) {
          console.warn('WebSocket-related promise rejection handled gracefully');
          event.preventDefault();
          return;
        }
      }

      // Check if it's a fetch error (network issues)
      if (event.reason instanceof TypeError && event.reason.message.includes('fetch')) {
        console.warn('Network fetch error handled gracefully');
        event.preventDefault();
        return;
      }

      // Prevent the default browser behavior for all unhandled rejections
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);

      // Don't let script errors crash the entire app
      if (event.error && event.error.name === 'ChunkLoadError') {
        console.warn('Chunk load error - possible network issue or cache problem');
        return true; // Prevent default handling
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
        <ReactQueryDevtools initialIsOpen={false} />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;