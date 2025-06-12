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
import Reports from "@/pages/Reports";
import ProjectValidation from "@/pages/ProjectValidation";

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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
