import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "react-error-boundary";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Invoices from "./pages/Invoices";
import InvoicePreview from "./pages/InvoicePreview";
import POMatching from "./pages/POMatching";
import ProjectMatcher from "./pages/ProjectMatcher";
import Reports from "./pages/Reports";
import ValidationRules from "./pages/ValidationRules";
import AILearningDashboard from "./pages/AILearningDashboard";
import InvoiceVerification from "./pages/InvoiceVerification";
import VerifiedInvoices from "./pages/VerifiedInvoices";
import LineItemClassification from "@/pages/LineItemClassification";
import PurchaseOrders from "./pages/PurchaseOrders";
import PettyCash from "./pages/PettyCash";
import ProjectValidation from "./pages/ProjectValidation";
import Settings from "./pages/Settings";
import ERPConnect from "./pages/ERPConnect";
import AIWorkflow from "./pages/AIWorkflow";
import React from "react";
import Header from "@/components/Header";

const Profile = () => (
  <div>
    <h1>Profile</h1>
    <p>This is the profile page.</p>
  </div>
);

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600 mb-4">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/preview/:id" component={InvoicePreview} />
          <Route path="/validation-rules" component={ValidationRules} />
          <Route path="/invoice-verification" component={InvoiceVerification} />
          <Route path="/verified-invoices" component={VerifiedInvoices} />
          <Route path="/classification" component={LineItemClassification} />
          <Route path="/petty-cash" component={PettyCash} />
          <Route path="/po-matching" component={POMatching} />
          <Route path="/project-matcher" component={ProjectMatcher} />
          <Route path="/purchase-orders" component={PurchaseOrders} />
          <Route path="/reports" component={Reports} />
          <Route path="/project-validation" component={ProjectValidation} />
          <Route path="/profile" component={Profile} />
          <Route path="/settings" component={Settings} />
          <Route path="/ai-learning" component={AILearningDashboard} />
          <Route path="/erp-connect">
            <Header />
            <ERPConnect />
          </Route>
          <Route path="/ai-workflow" component={AIWorkflow} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;