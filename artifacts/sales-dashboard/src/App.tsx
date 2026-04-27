import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BusinessProvider } from "@/contexts/BusinessContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

import SignInPage from "@/pages/auth/sign-in";
import BusinessesPage from "@/pages/businesses";
import LeadsPage from "@/pages/leads";
import TemplatesPage from "@/pages/templates";
import EmailLogsPage from "@/pages/email-logs";
import SchedulePage from "@/pages/schedule";
import SnsPage from "@/pages/sns";
import PrFreePage from "@/pages/pr-free";
import JimotyPage from "@/pages/jimoty";
import NotFound from "@/pages/not-found";

function HomeRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? <Redirect to="/businesses" /> : <Redirect to="/sign-in" />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return (
    <SidebarLayout>
      <Component />
    </SidebarLayout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignInPage} />

      <Route path="/businesses"><ProtectedRoute component={BusinessesPage} /></Route>
      <Route path="/leads"><ProtectedRoute component={LeadsPage} /></Route>
      <Route path="/templates"><ProtectedRoute component={TemplatesPage} /></Route>
      <Route path="/email-logs"><ProtectedRoute component={EmailLogsPage} /></Route>
      <Route path="/schedule"><ProtectedRoute component={SchedulePage} /></Route>
      <Route path="/sns"><ProtectedRoute component={SnsPage} /></Route>
      <Route path="/pr-free"><ProtectedRoute component={PrFreePage} /></Route>
      <Route path="/jimoty"><ProtectedRoute component={JimotyPage} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="app-theme">
      <TooltipProvider>
        <WouterRouter>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <BusinessProvider>
                <AppRoutes />
              </BusinessProvider>
            </AuthProvider>
          </QueryClientProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
