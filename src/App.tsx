import { DebugTerminal, RouteLogger } from '@/components/debug'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DebugProvider } from '@/contexts/DebugContext'
import { SuperAdminProvider } from '@/contexts/SuperAdminContext'
import { TTNConfigProvider } from '@/contexts/TTNConfigContext'
import { stackClientApp } from '@/lib/stack/client'
import { TRPCProvider, createTRPCClientInstance } from '@/lib/trpc'
import { RealtimeProvider } from '@/providers/RealtimeProvider'
import { StackProvider, StackTheme, useUser } from '@stackframe/react'
import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from '@tanstack/react-query'
import { Suspense, useMemo } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { RequireImpersonationGuard } from './components/guards/RequireImpersonationGuard'
import { ImpersonationCacheSync, PlatformGuard } from './components/platform'
import AccountDeleted from './pages/AccountDeleted'
import Alerts from './pages/Alerts'
import AreaDetail from './pages/AreaDetail'
import Areas from './pages/Areas'
import Auth from './pages/Auth'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './pages/Dashboard'
import DataMaintenance from './pages/DataMaintenance'
import EventHistory from './pages/EventHistory'
import HealthDashboard from './pages/HealthDashboard'
import Index from './pages/Index'
import Inspector from './pages/Inspector'
import ManualLog from './pages/ManualLog'
import NotFound from './pages/NotFound'
import Onboarding from './pages/Onboarding'
import OrganizationDashboard from './pages/OrganizationDashboard'
import PilotSetup from './pages/PilotSetup'
import PlatformAuditLog from './pages/platform/PlatformAuditLog'
import PlatformDeveloperTools from './pages/platform/PlatformDeveloperTools'
import PlatformOrganizationDetail from './pages/platform/PlatformOrganizationDetail'
import PlatformOrganizations from './pages/platform/PlatformOrganizations'
import PlatformUserDetail from './pages/platform/PlatformUserDetail'
import PlatformUsers from './pages/platform/PlatformUsers'
import PrivacyPolicy from './pages/PrivacyPolicy'
import RecentlyDeleted from './pages/RecentlyDeleted'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import SiteDetail from './pages/SiteDetail'
import Sites from './pages/Sites'
import TermsConditions from './pages/TermsConditions'
import TTNCleanup from './pages/TTNCleanup'
import UnitDetail from './pages/UnitDetail'
import Units from './pages/Units'
import UploadTelnyxImage from './pages/UploadTelnyxImage'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 30 * 1000,
			retry: 1,
		},
	},
})

function TRPCWrapper({ children }: { children: React.ReactNode }) {
	const user = useUser()
	const queryClient = useQueryClient()

	const trpcClient = useMemo(() => {
		return createTRPCClientInstance(async () => {
			if (!user) throw new Error('User not authenticated')
			const { accessToken } = await user.getAuthJson()
			return accessToken
		})
	}, [user])

	return (
		<TRPCProvider client={trpcClient} queryClient={queryClient}>
			{children}
		</TRPCProvider>
	)
}

const App = () => {
	return (
		<Suspense
			fallback={
				<div className='flex items-center justify-center h-screen'>
					Loading...
				</div>
			}
		>
			<StackProvider app={stackClientApp}>
				<StackTheme>
					<QueryClientProvider client={queryClient}>
						<TRPCWrapper>
							<RealtimeProvider>
								<TooltipProvider>
									<DebugProvider>
										<TTNConfigProvider>
											<Toaster />
											<Sonner />
											<BrowserRouter>
												<SuperAdminProvider>
													<ImpersonationCacheSync />
													<RouteLogger />
													<Routes>
														<Route path='/' element={<Index />} />
														<Route
															path='/privacy'
															element={<PrivacyPolicy />}
														/>
														<Route
															path='/terms'
															element={<TermsConditions />}
														/>
														<Route path='/auth' element={<Auth />} />
														<Route
															path='/auth/callback'
															element={<AuthCallback />}
														/>
														<Route
															path='/dashboard'
															element={
																<RequireImpersonationGuard>
																	<Dashboard />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/organization'
															element={
																<RequireImpersonationGuard>
																	<OrganizationDashboard />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/onboarding'
															element={<Onboarding />}
														/>
														<Route
															path='/sites'
															element={
																<RequireImpersonationGuard>
																	<Sites />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/sites/:siteId/layout/:layoutKey'
															element={
																<RequireImpersonationGuard>
																	<SiteDetail />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/sites/:siteId'
															element={
																<RequireImpersonationGuard>
																	<SiteDetail />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/sites/:siteId/areas'
															element={
																<RequireImpersonationGuard>
																	<Areas />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/sites/:siteId/areas/:areaId'
															element={
																<RequireImpersonationGuard>
																	<AreaDetail />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/units'
															element={
																<RequireImpersonationGuard>
																	<Units />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/units/:unitId/layout/:layoutKey'
															element={
																<RequireImpersonationGuard>
																	<UnitDetail />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/units/:unitId'
															element={
																<RequireImpersonationGuard>
																	<UnitDetail />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/manual-log'
															element={
																<RequireImpersonationGuard>
																	<ManualLog />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/alerts'
															element={
																<RequireImpersonationGuard>
																	<Alerts />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/reports'
															element={
																<RequireImpersonationGuard>
																	<Reports />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/settings'
															element={
																<RequireImpersonationGuard>
																	<Settings />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/inspector'
															element={
																<RequireImpersonationGuard>
																	<Inspector />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/pilot-setup'
															element={
																<RequireImpersonationGuard>
																	<PilotSetup />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/events'
															element={
																<RequireImpersonationGuard>
																	<EventHistory />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/admin/recently-deleted'
															element={
																<RequireImpersonationGuard>
																	<RecentlyDeleted />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/admin/ttn-cleanup'
															element={
																<RequireImpersonationGuard>
																	<TTNCleanup />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/admin/data-maintenance'
															element={
																<RequireImpersonationGuard>
																	<DataMaintenance />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/admin/health'
															element={
																<RequireImpersonationGuard>
																	<HealthDashboard />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/admin/upload-telnyx-image'
															element={
																<RequireImpersonationGuard>
																	<UploadTelnyxImage />
																</RequireImpersonationGuard>
															}
														/>
														<Route
															path='/account-deleted'
															element={<AccountDeleted />}
														/>
														<Route
															path='/platform'
															element={
																<PlatformGuard>
																	<PlatformOrganizations />
																</PlatformGuard>
															}
														/>
														<Route
															path='/platform/organizations'
															element={
																<PlatformGuard>
																	<PlatformOrganizations />
																</PlatformGuard>
															}
														/>
														<Route
															path='/platform/organizations/:orgId'
															element={
																<PlatformGuard>
																	<PlatformOrganizationDetail />
																</PlatformGuard>
															}
														/>
														<Route
															path='/platform/users'
															element={
																<PlatformGuard>
																	<PlatformUsers />
																</PlatformGuard>
															}
														/>
														<Route
															path='/platform/users/:userId'
															element={
																<PlatformGuard>
																	<PlatformUserDetail />
																</PlatformGuard>
															}
														/>
														<Route
															path='/platform/audit'
															element={
																<PlatformGuard>
																	<PlatformAuditLog />
																</PlatformGuard>
															}
														/>
														<Route
															path='/platform/developer-tools'
															element={
																<PlatformGuard>
																	<PlatformDeveloperTools />
																</PlatformGuard>
															}
														/>
														<Route path='*' element={<NotFound />} />
													</Routes>
													<DebugTerminal />
												</SuperAdminProvider>
											</BrowserRouter>
										</TTNConfigProvider>
									</DebugProvider>
								</TooltipProvider>
							</RealtimeProvider>
						</TRPCWrapper>
					</QueryClientProvider>
				</StackTheme>
			</StackProvider>
		</Suspense>
	)
}

export default App
