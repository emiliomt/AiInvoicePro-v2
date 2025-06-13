import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Invoices from "@/pages/Invoices";
import Approvals from "@/pages/Approvals";
import ValidationRules from "@/pages/ValidationRules";
import PettyCash from "@/pages/PettyCash";
import POMatching from "@/pages/POMatching";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Reports from "@/pages/Reports";
import ProjectValidation from "@/pages/ProjectValidation";
import { ErrorBoundary } from "react-error-boundary";
import React from "react";

function ErrorFallback({ error }) {
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
          <Route path="/approvals" component={Approvals} />
          <Route path="/validation-rules" component={ValidationRules} />
          <Route path="/petty-cash" component={PettyCash} />
          <Route path="/po-matching" component={POMatching} />
          <Route path="/purchase-orders" component={PurchaseOrders} />
          <Route path="/reports" component={Reports} />
          <Route path="/project-validation" component={ProjectValidation} />
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