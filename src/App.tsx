import { StackProvider, StackTheme, useUser } from '@stackframe/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireImpersonationGuard } from './components/guards/RequireImpersonationGuard';
import { ImpersonationCacheSync, PlatformGuard } from './components/platform';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import { DebugTerminal, RouteLogger } from '@/components/debug';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DebugProvider } from '@/contexts/DebugContext';
import { SuperAdminProvider } from '@/contexts/SuperAdminContext';
import { TTNConfigProvider } from '@/contexts/TTNConfigContext';
import { stackClientApp } from '@/lib/stack/client';
import { TRPCProvider, createTRPCClientInstance } from '@/lib/trpc';
import { RealtimeProvider } from '@/providers/RealtimeProvider';

// --- Critical-path pages (loaded eagerly) ---

// --- Lazy-loaded pages ---
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
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OrganizationDashboard = lazy(() => import('./pages/OrganizationDashboard'));
const PilotSetup = lazy(() => import('./pages/PilotSetup'));
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

// --- Platform (super admin) pages ---
const PlatformAuditLog = lazy(() => import('./pages/platform/PlatformAuditLog'));
const PlatformDeveloperTools = lazy(() => import('./pages/platform/PlatformDeveloperTools'));
const PlatformOrganizationDetail = lazy(
  () => import('./pages/platform/PlatformOrganizationDetail'),
);
const PlatformOrganizations = lazy(() => import('./pages/platform/PlatformOrganizations'));
const PlatformUserDetail = lazy(() => import('./pages/platform/PlatformUserDetail'));
const PlatformUsers = lazy(() => import('./pages/platform/PlatformUsers'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000, // 60 seconds — real-time monitoring needs fresher data
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

/** Route-level loading fallback */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

const App = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <ServiceWorkerRegistration />
      <StackProvider app={stackClientApp}>
        <StackTheme>
          <QueryClientProvider client={queryClient}>
            <TRPCWrapper>
              <TooltipProvider>
                <DebugProvider>
                  <TTNConfigProvider>
                    <Toaster />
                    <Sonner />
                    <BrowserRouter>
                      <SuperAdminProvider>
                        <RealtimeProvider>
                          <ImpersonationCacheSync />
                          <RouteLogger />
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                              <Route path="/" element={<Index />} />
                              <Route path="/privacy" element={<PrivacyPolicy />} />
                              <Route path="/terms" element={<TermsConditions />} />
                              <Route path="/auth" element={<Auth />} />
                              <Route path="/auth/callback" element={<AuthCallback />} />
                              <Route
                                path="/dashboard"
                                element={
                                  <RequireImpersonationGuard>
                                    <Dashboard />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/organization"
                                element={
                                  <RequireImpersonationGuard>
                                    <OrganizationDashboard />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route path="/onboarding" element={<Onboarding />} />
                              <Route
                                path="/sites"
                                element={
                                  <RequireImpersonationGuard>
                                    <Sites />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/sites/:siteId/layout/:layoutKey"
                                element={
                                  <RequireImpersonationGuard>
                                    <SiteDetail />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/sites/:siteId"
                                element={
                                  <RequireImpersonationGuard>
                                    <SiteDetail />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/sites/:siteId/areas"
                                element={
                                  <RequireImpersonationGuard>
                                    <Areas />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/sites/:siteId/areas/:areaId"
                                element={
                                  <RequireImpersonationGuard>
                                    <AreaDetail />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/units"
                                element={
                                  <RequireImpersonationGuard>
                                    <Units />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/units/:unitId/layout/:layoutKey"
                                element={
                                  <RequireImpersonationGuard>
                                    <UnitDetail />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/units/:unitId"
                                element={
                                  <RequireImpersonationGuard>
                                    <UnitDetail />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/manual-log"
                                element={
                                  <RequireImpersonationGuard>
                                    <ManualLog />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/alerts"
                                element={
                                  <RequireImpersonationGuard>
                                    <Alerts />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/reports"
                                element={
                                  <RequireImpersonationGuard>
                                    <Reports />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/settings"
                                element={
                                  <RequireImpersonationGuard>
                                    <Settings />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/inspector"
                                element={
                                  <RequireImpersonationGuard>
                                    <Inspector />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/pilot-setup"
                                element={
                                  <RequireImpersonationGuard>
                                    <PilotSetup />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/events"
                                element={
                                  <RequireImpersonationGuard>
                                    <EventHistory />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/admin/recently-deleted"
                                element={
                                  <RequireImpersonationGuard>
                                    <RecentlyDeleted />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/admin/ttn-cleanup"
                                element={
                                  <RequireImpersonationGuard>
                                    <TTNCleanup />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/admin/data-maintenance"
                                element={
                                  <RequireImpersonationGuard>
                                    <DataMaintenance />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/admin/health"
                                element={
                                  <RequireImpersonationGuard>
                                    <HealthDashboard />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route
                                path="/admin/upload-telnyx-image"
                                element={
                                  <RequireImpersonationGuard>
                                    <UploadTelnyxImage />
                                  </RequireImpersonationGuard>
                                }
                              />
                              <Route path="/account-deleted" element={<AccountDeleted />} />
                              <Route
                                path="/platform"
                                element={
                                  <PlatformGuard>
                                    <PlatformOrganizations />
                                  </PlatformGuard>
                                }
                              />
                              <Route
                                path="/platform/organizations"
                                element={
                                  <PlatformGuard>
                                    <PlatformOrganizations />
                                  </PlatformGuard>
                                }
                              />
                              <Route
                                path="/platform/organizations/:orgId"
                                element={
                                  <PlatformGuard>
                                    <PlatformOrganizationDetail />
                                  </PlatformGuard>
                                }
                              />
                              <Route
                                path="/platform/users"
                                element={
                                  <PlatformGuard>
                                    <PlatformUsers />
                                  </PlatformGuard>
                                }
                              />
                              <Route
                                path="/platform/users/:userId"
                                element={
                                  <PlatformGuard>
                                    <PlatformUserDetail />
                                  </PlatformGuard>
                                }
                              />
                              <Route
                                path="/platform/audit"
                                element={
                                  <PlatformGuard>
                                    <PlatformAuditLog />
                                  </PlatformGuard>
                                }
                              />
                              <Route
                                path="/platform/developer-tools"
                                element={
                                  <PlatformGuard>
                                    <PlatformDeveloperTools />
                                  </PlatformGuard>
                                }
                              />
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </Suspense>
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
