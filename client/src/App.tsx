import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/" />} />
        <Route path="/invoices" element={user ? <Invoices /> : <Navigate to="/" />} />
        <Route path="/invoices/:id/preview" element={user ? <InvoicePreview /> : <Navigate to="/" />} />
        <Route path="/profile" element={user ? <Profile /> : <Navigate to="/" />} />
        <Route path="/approvals" element={user ? <Approvals /> : <Navigate to="/" />} />
        <Route path="/settings" element={user ? <Settings /> : <Navigate to="/" />} />
        <Route path="/reports" element={user ? <Reports /> : <Navigate to="/" />} />
        <Route path="/petty-cash" element={user ? <PettyCash /> : <Navigate to="/" />} />
        <Route path="/project-validation" element={user ? <ProjectValidation /> : <Navigate to="/" />} />
        <Route path="/validation-rules" element={user ? <ValidationRules /> : <Navigate to="/" />} />
        <Route path="/po-matching" element={user ? <POMatching /> : <Navigate to="/" />} />
        <Route path="/purchase-orders" element={user ? <PurchaseOrders /> : <Navigate to="/" />} />
        <Route path="/project-matcher" element={user ? <ProjectMatcher /> : <Navigate to="/" />} />
        <Route path="/verified-invoices" element={user ? <VerifiedInvoices /> : <Navigate to="/" />} />
        <Route path="/invoice-verification" element={user ? <InvoiceVerification /> : <Navigate to="/" />} />
        <Route path="/ai-learning" element={user ? <AILearningDashboard /> : <Navigate to="/" />} />
        <Route path="/line-item-classification" element={user ? <LineItemClassification /> : <Navigate to="/" />} />
        <Route path="/erp-connect" element={user ? <ERPConnect /> : <Navigate to="/" />} />
        <Route path="/rpa-dashboard" element={user ? <RPADashboard /> : <Navigate to="/" />} />
        <Route path="/ai-workflow" element={user ? <AiWorkflow /> : <Navigate to="/" />} />
        <Route path="/invoice-importer" element={user ? <InvoiceImporter /> : <Navigate to="/" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </Router>
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