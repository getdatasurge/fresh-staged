import { DebugTerminal, RouteLogger } from '@/components/debug';
import { QueryErrorBoundary } from '@/components/errors/QueryErrorBoundary';
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
import { lazy, Suspense, useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import PageSkeleton from './components/PageSkeleton';
import { RequireImpersonationGuard } from './components/guards/RequireImpersonationGuard';
import { ImpersonationCacheSync, PlatformGuard } from './components/platform';

// Critical path - static imports (landing, auth flow)
import Index from './pages/Index';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';

// Route-level code splitting - lazy loaded
const AccountDeleted = lazy(() => import('./pages/AccountDeleted'));
const Alerts = lazy(() => import('./pages/Alerts'));
const AreaDetail = lazy(() => import('./pages/AreaDetail'));
const Areas = lazy(() => import('./pages/Areas'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DataMaintenance = lazy(() => import('./pages/DataMaintenance'));
const EventHistory = lazy(() => import('./pages/EventHistory'));
const HealthDashboard = lazy(() => import('./pages/HealthDashboard'));
const Inspector = lazy(() => import('./pages/Inspector'));
const ManualLog = lazy(() => import('./pages/ManualLog'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OrganizationDashboard = lazy(() => import('./pages/OrganizationDashboard'));
const PilotSetup = lazy(() => import('./pages/PilotSetup'));
const PlatformAuditLog = lazy(() => import('./pages/platform/PlatformAuditLog'));
const PlatformDeveloperTools = lazy(() => import('./pages/platform/PlatformDeveloperTools'));
const PlatformOrganizationDetail = lazy(
  () => import('./pages/platform/PlatformOrganizationDetail'),
);
const PlatformOrganizations = lazy(() => import('./pages/platform/PlatformOrganizations'));
const PlatformUserDetail = lazy(() => import('./pages/platform/PlatformUserDetail'));
const PlatformUsers = lazy(() => import('./pages/platform/PlatformUsers'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const RecentlyDeleted = lazy(() => import('./pages/RecentlyDeleted'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const SiteDetail = lazy(() => import('./pages/SiteDetail'));
const Sites = lazy(() => import('./pages/Sites'));
const TermsConditions = lazy(() => import('./pages/TermsConditions'));
const TTNCleanup = lazy(() => import('./pages/TTNCleanup'));
const UnitDetail = lazy(() => import('./pages/UnitDetail'));
const Units = lazy(() => import('./pages/Units'));
const UploadTelnyxImage = lazy(() => import('./pages/UploadTelnyxImage'));

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
 * Uses QueryErrorBoundary so that "Try Again" also resets failed TanStack queries.
 */
function DashboardErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <QueryErrorBoundary title="Dashboard Error">
      <RequireImpersonationGuard>{children}</RequireImpersonationGuard>
    </QueryErrorBoundary>
  );
}

/**
 * Per-route error boundary wrapper for admin routes.
 * Uses QueryErrorBoundary so that "Try Again" also resets failed TanStack queries.
 */
function AdminErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <QueryErrorBoundary title="Admin Page Error">
      <RequireImpersonationGuard>{children}</RequireImpersonationGuard>
    </QueryErrorBoundary>
  );
}

/**
 * Per-route error boundary wrapper for platform routes.
 * Uses QueryErrorBoundary so that "Try Again" also resets failed TanStack queries.
 */
function PlatformErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <QueryErrorBoundary title="Platform Error">
      <PlatformGuard>{children}</PlatformGuard>
    </QueryErrorBoundary>
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
