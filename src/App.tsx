import { DebugTerminal, RouteLogger } from '@/components/debug';
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary';
import { RouteErrorFallback } from '@/components/errors/RouteErrorFallback';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DebugProvider } from '@/contexts/DebugContext';
import { SuperAdminProvider } from '@/contexts/SuperAdminContext';
import { TTNConfigProvider } from '@/contexts/TTNConfigContext';
import { stackClientApp } from '@/lib/stack/client';
import { TRPCProvider, createTRPCClientInstance } from '@/lib/trpc';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { StackProvider, StackTheme, useUser } from '@stackframe/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Suspense, useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import PageSkeleton from './components/PageSkeleton';
import { RequireImpersonationGuard } from './components/guards/RequireImpersonationGuard';
import { ImpersonationCacheSync, PlatformGuard } from './components/platform';
import AccountDeleted from './pages/AccountDeleted';
import Alerts from './pages/Alerts';
import AreaDetail from './pages/AreaDetail';
import Areas from './pages/Areas';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import DataMaintenance from './pages/DataMaintenance';
import EventHistory from './pages/EventHistory';
import HealthDashboard from './pages/HealthDashboard';
import Index from './pages/Index';
import Inspector from './pages/Inspector';
import ManualLog from './pages/ManualLog';
import NotFound from './pages/NotFound';
import Onboarding from './pages/Onboarding';
import OrganizationDashboard from './pages/OrganizationDashboard';
import PilotSetup from './pages/PilotSetup';
import PlatformAuditLog from './pages/platform/PlatformAuditLog';
import PlatformDeveloperTools from './pages/platform/PlatformDeveloperTools';
import PlatformOrganizationDetail from './pages/platform/PlatformOrganizationDetail';
import PlatformOrganizations from './pages/platform/PlatformOrganizations';
import PlatformUserDetail from './pages/platform/PlatformUserDetail';
import PlatformUsers from './pages/platform/PlatformUsers';
import PrivacyPolicy from './pages/PrivacyPolicy';
import RecentlyDeleted from './pages/RecentlyDeleted';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SiteDetail from './pages/SiteDetail';
import Sites from './pages/Sites';
import TermsConditions from './pages/TermsConditions';
import TTNCleanup from './pages/TTNCleanup';
import UnitDetail from './pages/UnitDetail';
import Units from './pages/Units';
import UploadTelnyxImage from './pages/UploadTelnyxImage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function TRPCWrapper({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const queryClient = useQueryClient();

  const trpcClient = useMemo(() => {
    return createTRPCClientInstance(async () => {
      if (!user) throw new Error('User not authenticated');
      const { accessToken } = await user.getAuthJson();
      return accessToken;
    });
  }, [user]);

  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}

/**
 * Per-route error boundary wrapper for dashboard routes.
 * Catches render errors from a single page without crashing the whole app.
 */
function DashboardErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary
      fallbackRender={({ error, onRetry }) => (
        <RouteErrorFallback error={error} title="Dashboard Error" onRetry={onRetry} />
      )}
    >
      <RequireImpersonationGuard>{children}</RequireImpersonationGuard>
    </AppErrorBoundary>
  );
}

/**
 * Per-route error boundary wrapper for admin routes.
 */
function AdminErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary
      fallbackRender={({ error, onRetry }) => (
        <RouteErrorFallback error={error} title="Admin Page Error" onRetry={onRetry} />
      )}
    >
      <RequireImpersonationGuard>{children}</RequireImpersonationGuard>
    </AppErrorBoundary>
  );
}

/**
 * Per-route error boundary wrapper for platform routes.
 */
function PlatformErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary
      fallbackRender={({ error, onRetry }) => (
        <RouteErrorFallback error={error} title="Platform Error" onRetry={onRetry} />
      )}
    >
      <PlatformGuard>{children}</PlatformGuard>
    </AppErrorBoundary>
  );
}

const App = () => {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ServiceWorkerRegistration />
      <StackProvider app={stackClientApp}>
        <StackTheme>
          <QueryClientProvider client={queryClient}>
            <TRPCWrapper>
              <TooltipProvider>
                <DebugProvider>
                  <TTNConfigProvider>
                    <Sonner />
                    <BrowserRouter>
                      <SuperAdminProvider>
                        <RealtimeProvider>
                          <ImpersonationCacheSync />
                          <RouteLogger />
                          <Routes>
                            {/* Public routes - no error boundary needed */}
                            <Route path="/" element={<Index />} />
                            <Route path="/privacy" element={<PrivacyPolicy />} />
                            <Route path="/terms" element={<TermsConditions />} />
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/auth/callback" element={<AuthCallback />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            <Route path="/account-deleted" element={<AccountDeleted />} />

                            {/* Dashboard routes - per-route error boundary */}
                            <Route
                              path="/dashboard"
                              element={
                                <DashboardErrorBoundary>
                                  <Dashboard />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/organization"
                              element={
                                <DashboardErrorBoundary>
                                  <OrganizationDashboard />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/sites"
                              element={
                                <DashboardErrorBoundary>
                                  <Sites />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/sites/:siteId/layout/:layoutKey"
                              element={
                                <DashboardErrorBoundary>
                                  <SiteDetail />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/sites/:siteId"
                              element={
                                <DashboardErrorBoundary>
                                  <SiteDetail />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/sites/:siteId/areas"
                              element={
                                <DashboardErrorBoundary>
                                  <Areas />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/sites/:siteId/areas/:areaId"
                              element={
                                <DashboardErrorBoundary>
                                  <AreaDetail />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/units"
                              element={
                                <DashboardErrorBoundary>
                                  <Units />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/units/:unitId/layout/:layoutKey"
                              element={
                                <DashboardErrorBoundary>
                                  <UnitDetail />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/units/:unitId"
                              element={
                                <DashboardErrorBoundary>
                                  <UnitDetail />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/manual-log"
                              element={
                                <DashboardErrorBoundary>
                                  <ManualLog />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/alerts"
                              element={
                                <DashboardErrorBoundary>
                                  <Alerts />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/reports"
                              element={
                                <DashboardErrorBoundary>
                                  <Reports />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/settings"
                              element={
                                <DashboardErrorBoundary>
                                  <Settings />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/inspector"
                              element={
                                <DashboardErrorBoundary>
                                  <Inspector />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/pilot-setup"
                              element={
                                <DashboardErrorBoundary>
                                  <PilotSetup />
                                </DashboardErrorBoundary>
                              }
                            />
                            <Route
                              path="/events"
                              element={
                                <DashboardErrorBoundary>
                                  <EventHistory />
                                </DashboardErrorBoundary>
                              }
                            />

                            {/* Admin routes - per-route error boundary */}
                            <Route
                              path="/admin/recently-deleted"
                              element={
                                <AdminErrorBoundary>
                                  <RecentlyDeleted />
                                </AdminErrorBoundary>
                              }
                            />
                            <Route
                              path="/admin/ttn-cleanup"
                              element={
                                <AdminErrorBoundary>
                                  <TTNCleanup />
                                </AdminErrorBoundary>
                              }
                            />
                            <Route
                              path="/admin/data-maintenance"
                              element={
                                <AdminErrorBoundary>
                                  <DataMaintenance />
                                </AdminErrorBoundary>
                              }
                            />
                            <Route
                              path="/admin/health"
                              element={
                                <AdminErrorBoundary>
                                  <HealthDashboard />
                                </AdminErrorBoundary>
                              }
                            />
                            <Route
                              path="/admin/upload-telnyx-image"
                              element={
                                <AdminErrorBoundary>
                                  <UploadTelnyxImage />
                                </AdminErrorBoundary>
                              }
                            />

                            {/* Platform routes - per-route error boundary */}
                            <Route
                              path="/platform"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformOrganizations />
                                </PlatformErrorBoundary>
                              }
                            />
                            <Route
                              path="/platform/organizations"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformOrganizations />
                                </PlatformErrorBoundary>
                              }
                            />
                            <Route
                              path="/platform/organizations/:orgId"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformOrganizationDetail />
                                </PlatformErrorBoundary>
                              }
                            />
                            <Route
                              path="/platform/users"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformUsers />
                                </PlatformErrorBoundary>
                              }
                            />
                            <Route
                              path="/platform/users/:userId"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformUserDetail />
                                </PlatformErrorBoundary>
                              }
                            />
                            <Route
                              path="/platform/audit"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformAuditLog />
                                </PlatformErrorBoundary>
                              }
                            />
                            <Route
                              path="/platform/developer-tools"
                              element={
                                <PlatformErrorBoundary>
                                  <PlatformDeveloperTools />
                                </PlatformErrorBoundary>
                              }
                            />

                            <Route path="*" element={<NotFound />} />
                          </Routes>
                          <DebugTerminal />
                        </RealtimeProvider>
                      </SuperAdminProvider>
                    </BrowserRouter>
                  </TTNConfigProvider>
                </DebugProvider>
              </TooltipProvider>
            </TRPCWrapper>
          </QueryClientProvider>
        </StackTheme>
      </StackProvider>
    </Suspense>
  );
};

export default App;
