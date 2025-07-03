import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/useAuth";

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
import ERPConnect from "@/pages/ERPConnect";
import RPADashboard from "@/pages/RPADashboard";
import AiWorkflow from "@/pages/AiWorkflow";
import InvoiceImporter from "@/pages/InvoiceImporter";
import InvoicePreview from "@/pages/InvoicePreview";
import NotFound from "@/pages/not-found";

// Import the existing query client from lib
import { queryClient } from "@/lib/queryClient";

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
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
        <Route>
          <NotFound />
        </Route>
      </Switch>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}