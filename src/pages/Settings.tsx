import { SensorSimulatorPanel } from '@/components/admin/SensorSimulatorPanel'
import { BillingTab } from '@/components/billing/BillingTab'
import DashboardLayout from '@/components/DashboardLayout'
import { DebugModeToggle } from '@/components/debug'
import { AccountDeletionModal } from '@/components/settings/AccountDeletionModal'
import { AlertRulesScopedEditor } from '@/components/settings/AlertRulesScopedEditor'
import { EmulatorResyncCard } from '@/components/settings/EmulatorResyncCard'
import { EmulatorSyncHistory } from '@/components/settings/EmulatorSyncHistory'
import { GatewayManager } from '@/components/settings/GatewayManager'
import { NotificationSettingsCard } from '@/components/settings/NotificationSettingsCard'
import { OptInImageStatusCard } from '@/components/settings/OptInImageStatusCard'
import { SecurityTab } from '@/components/settings/SecurityTab'
import { SensorManager } from '@/components/settings/SensorManager'
import { SmsAlertHistory } from '@/components/settings/SmsAlertHistory'
import { TelnyxWebhookUrlsCard } from '@/components/settings/TelnyxWebhookUrlsCard'
import { TollFreeVerificationCard } from '@/components/settings/TollFreeVerificationCard'
import { TTNConnectionSettings } from '@/components/settings/TTNConnectionSettings'
import { TTNCredentialsPanel } from '@/components/settings/TTNCredentialsPanel'
import { TTNProvisioningLogs } from '@/components/settings/TTNProvisioningLogs'
import { WebhookStatusCard } from '@/components/settings/WebhookStatusCard'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity'
import { AppRole, ComplianceMode } from '@/lib/api-types'
import { useTRPC, useTRPCClient } from '@/lib/trpc'
import { useUser } from '@stackframe/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
	AlertTriangle,
	Bell,
	Building2,
	CheckCircle,
	Code2,
	CreditCard,
	Crown,
	Eye,
	Loader2,
	Lock,
	Mail,
	MessageSquare,
	Radio,
	Save,
	Shield,
	Smartphone,
	Thermometer,
	Trash2,
	User,
	UserPlus,
	Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

// E.164 phone number validation regex
const E164_REGEX = /^\+[1-9]\d{1,14}$/

// Helper to format phone number for display as user types
const formatPhoneForInput = (value: string): string => {
	// Remove all non-digit characters except +
	const cleaned = value.replace(/[^\d+]/g, '')
	// Ensure it starts with +
	if (cleaned && !cleaned.startsWith('+')) {
		return '+' + cleaned
	}
	return cleaned
}

// Helper to validate E.164 format
const isValidE164 = (phone: string): boolean => {
	return E164_REGEX.test(phone)
}

interface Organization {
	id: string
	name: string
	slug: string
	timezone: string
	compliance_mode: ComplianceMode
}

interface NotificationPrefs {
	push?: boolean
	email?: boolean
	sms?: boolean
}

interface Profile {
	id: string
	user_id: string
	email: string
	full_name: string | null
	phone: string | null
	notification_preferences: NotificationPrefs | null
}

interface UserWithRole {
	id: string
	user_id: string
	email: string
	full_name: string | null
	role: AppRole
}

const roleConfig: Record<
	AppRole,
	{ label: string; icon: React.ElementType; color: string }
> = {
	owner: {
		label: 'Owner',
		icon: Crown,
		color: 'bg-warning/15 text-warning border-warning/30',
	},
	admin: {
		label: 'Admin',
		icon: Shield,
		color: 'bg-accent/15 text-accent border-accent/30',
	},
	manager: {
		label: 'Manager',
		icon: Users,
		color: 'bg-primary/15 text-primary border-primary/30',
	},
	staff: {
		label: 'Staff',
		icon: User,
		color: 'bg-safe/15 text-safe border-safe/30',
	},
	viewer: {
		label: 'Viewer',
		icon: Eye,
		color: 'bg-muted text-muted-foreground border-border',
	},
}

const timezones = [
	{ value: 'America/New_York', label: 'Eastern Time (ET)' },
	{ value: 'America/Chicago', label: 'Central Time (CT)' },
	{ value: 'America/Denver', label: 'Mountain Time (MT)' },
	{ value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
	{ value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
	{ value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
	{ value: 'Europe/London', label: 'London (GMT)' },
	{ value: 'Europe/Paris', label: 'Paris (CET)' },
	{ value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
	{ value: 'Australia/Sydney', label: 'Sydney (AEST)' },
]

// Alert Rules Tab Component now uses the scoped editor directly

const Settings = () => {
	const navigate = useNavigate()
	const stackUser = useUser()
	const trpc = useTRPC()
	const trpcClient = useTRPCClient()
	const {
		effectiveOrgId,
		isImpersonating,
		isInitialized: identityInitialized,
	} = useEffectiveIdentity()

	const [isSaving, setIsSaving] = useState(false)

	// tRPC Queries
	const profileQuery = useQuery(
		trpc.users.me.queryOptions(undefined, {
			enabled: !!stackUser,
		})
	)

	const orgQuery = useQuery(
		trpc.organizations.get.queryOptions(
			{ organizationId: effectiveOrgId! },
			{ enabled: !!effectiveOrgId && identityInitialized },
		)
	)

	const membersQuery = useQuery(
		trpc.organizations.listMembers.queryOptions(
			{ organizationId: effectiveOrgId! },
			{ enabled: !!effectiveOrgId && identityInitialized },
		)
	)

	const statsQuery = useQuery(
		trpc.organizations.stats.queryOptions(
			{ organizationId: effectiveOrgId! },
			{ enabled: !!effectiveOrgId && identityInitialized },
		)
	)

	const sitesQuery = useQuery(
		trpc.sites.list.queryOptions(
			{ organizationId: effectiveOrgId! },
			{ enabled: !!effectiveOrgId && identityInitialized },
		)
	)

	const unitsQuery = useQuery(
		trpc.units.listByOrg.queryOptions(
			{ organizationId: effectiveOrgId! },
			{ enabled: !!effectiveOrgId && identityInitialized },
		)
	)

	// Form states
	const [orgName, setOrgName] = useState('')
	const [orgTimezone, setOrgTimezone] = useState('')
	const [orgCompliance, setOrgCompliance] = useState<ComplianceMode>('standard')
	const [notifPush, setNotifPush] = useState(true)
	const [notifEmail, setNotifEmail] = useState(true)
	const [notifSms, setNotifSms] = useState(false)
	const [userPhone, setUserPhone] = useState('')

	// Sync derived state
	const organization = orgQuery.data || null
	const profile = profileQuery.data?.profile || null
	const userRole =
		((isImpersonating ? 'admin' : profileQuery.data?.role) as AppRole) || null

	const users: UserWithRole[] = useMemo(() => {
		return (membersQuery.data || []).map(m => ({
			id: m.userId,
			user_id: m.userId,
			email: m.email,
			full_name: m.fullName,
			role: m.role as AppRole,
		}))
	}, [membersQuery.data])

	const sites = useMemo(() => {
		return (sitesQuery.data || []).map(s => ({
			id: s.id,
			name: s.name,
		}))
	}, [sitesQuery.data])

	const units = useMemo(() => {
		return (unitsQuery.data || []).map(u => ({
			id: u.id,
			name: u.name,
			site_id: u.siteId,
		}))
	}, [unitsQuery.data])

	const sensorCount = statsQuery.data?.unitCounts.total || 0
	const gatewayCount = statsQuery.data?.siteCount || 0 // Using siteCount as proxy for gateways for now if not available
	const hasOtherUsers = (membersQuery.data?.length || 0) > 1

	// Dialog states
	const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
	const [inviteOpen, setInviteOpen] = useState(false)
	const [inviteEmail, setInviteEmail] = useState('')
	const [inviteRole, setInviteRole] = useState<AppRole>('staff')
	const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
		open: boolean
		userId: string
		userName: string
		currentRole: AppRole
		newRole: AppRole
	} | null>(null)
	const [removeUserConfirm, setRemoveUserConfirm] = useState<{
		open: boolean
		userId: string
		userName: string
		role: AppRole
	} | null>(null)

	const [searchParams] = useSearchParams()
	const defaultTab = searchParams.get('tab') || 'organization'
	const action = searchParams.get('action')

	const isLoading =
		profileQuery.isLoading || orgQuery.isLoading || !identityInitialized

	useEffect(() => {
		if (organization) {
			setOrgName(organization.name)
			setOrgTimezone(organization.timezone)
			setOrgCompliance(organization.complianceMode as ComplianceMode)
		}
	}, [organization])

	useEffect(() => {
		if (profile) {
			setUserPhone(profile.phone || '')
			setNotifPush(profile.pushEnabled ?? true)
			setNotifEmail(profile.emailEnabled ?? true)
			setNotifSms(profile.smsEnabled ?? false)
		}
	}, [profile])

	const refreshSettings = () => {
		profileQuery.refetch()
		orgQuery.refetch()
		membersQuery.refetch()
		statsQuery.refetch()
		sitesQuery.refetch()
		unitsQuery.refetch()
	}

	const [ttnConfig, setTtnConfig] = useState<{
		isEnabled: boolean
		hasApiKey: boolean
		applicationId: string | null
		apiKeyLast4: string | null
	} | null>(null)

	// Fetch TTN settings using tRPC
	const ttnSettingsQuery = useQuery(
		trpc.ttnSettings.get.queryOptions(
			{ organizationId: effectiveOrgId! },
			{ enabled: !!effectiveOrgId && identityInitialized },
		)
	)

	// Handle TTN settings data changes
	useEffect(() => {
		if (ttnSettingsQuery.data) {
			setTtnConfig({
				isEnabled: ttnSettingsQuery.data.isEnabled ?? false,
				hasApiKey: !!(ttnSettingsQuery.data.apiKeyLast4 || ttnSettingsQuery.data.hasApiKey),
				applicationId: ttnSettingsQuery.data.applicationId ?? null,
				apiKeyLast4: ttnSettingsQuery.data.apiKeyLast4 ?? null,
			})
		}
	}, [ttnSettingsQuery.data])

	// Log TTN settings errors
	useEffect(() => {
		if (ttnSettingsQuery.error) {
			console.error('Failed to load TTN config:', ttnSettingsQuery.error)
		}
	}, [ttnSettingsQuery.error])

	const saveOrganization = async () => {
		setIsSaving(true)
		try {
			await trpcClient.organizations.update.mutate({
				organizationId: effectiveOrgId!,
				data: {
					name: orgName,
					timezone: orgTimezone,
					complianceMode: orgCompliance as any,
				},
			})
			toast.success('Organization updated')
			orgQuery.refetch()
		} catch (error) {
			console.error('Error saving organization:', error)
			toast.error('Failed to save organization')
		}
		setIsSaving(false)
	}

	const saveNotifications = async () => {
		if (!profile) return

		// Validate phone number if SMS is enabled
		if (notifSms && userPhone) {
			if (!isValidE164(userPhone)) {
				toast.error(
					'Invalid phone number format. Please use E.164 format (e.g., +15551234567)',
				)
				return
			}
		}

		setIsSaving(true)
		try {
			await trpcClient.users.updateProfile.mutate({
				fullName: profile.fullName || undefined,
				phone: userPhone || null,
				notificationPreferences: {
					push: notifPush,
					email: notifEmail,
					sms: notifSms,
				},
			})
			toast.success('Notification preferences saved')
			profileQuery.refetch()
		} catch (error) {
			console.error('Error saving notifications:', error)
			toast.error('Failed to save preferences')
		}
		setIsSaving(false)
	}

	const [isSendingSms, setIsSendingSms] = useState(false)
	const [smsVerified, setSmsVerified] = useState<boolean | null>(null)
	const queryClient = useQueryClient()

	// Helper to parse Telnyx-specific errors into user-friendly messages
	const getTelnyxErrorMessage = (error: string): string => {
		if (error.includes('10009') || error.includes('Authentication')) {
			return 'SMS authentication failed. Please contact support.'
		}
		if (
			error.includes('40310') ||
			error.includes('40311') ||
			error.includes('invalid')
		) {
			return 'Invalid phone number format or number not SMS-capable.'
		}
		if (error.includes('40300') || error.includes('opted out')) {
			return 'This number has opted out of SMS. Reply START to re-enable.'
		}
		if (error.includes('40001') || error.includes('landline')) {
			return 'Cannot send SMS to landline numbers.'
		}
		if (
			error.includes('40002') ||
			error.includes('40003') ||
			error.includes('blocked')
		) {
			return 'Message blocked by carrier. Try a different message.'
		}
		if (error.includes('20100') || error.includes('funds')) {
			return 'SMS service temporarily unavailable. Contact support.'
		}
		if (error.includes('rate') || error.includes('limit')) {
			return 'Rate limited. Please wait a few minutes before trying again.'
		}
		return error
	}

	const sendTestSms = async () => {
		if (!profile || !userPhone || !organization) return

		if (!isValidE164(userPhone)) {
			toast.error(
				'Invalid phone number. Please save a valid E.164 format number first.',
			)
			return
		}

		setIsSendingSms(true)
		try {
			toast.loading('Sending test SMS...', { id: 'test-sms' })

			const result = await trpcClient.notificationPolicies.sendTestSms.mutate({
				to: userPhone,
				message:
					'✅ FreshTrack Test: Your SMS alerts are configured correctly! You will receive critical alerts at this number.',
			})

			if (result?.status === 'sent') {
				// Check for verification warning
				if (result.warning) {
					toast.warning(`SMS sent with warning: ${result.warning}`, {
						id: 'test-sms',
						duration: 8000,
					})
				} else {
					toast.success(
						`Test SMS sent! (ID: ${result.provider_message_id?.slice(-8) || 'confirmed'})`,
						{ id: 'test-sms' },
					)
				}
				setSmsVerified(true)
				// Refresh SMS history
				queryClient.invalidateQueries({
					queryKey: ['sms-alert-history', organization.id],
				})
			} else if (result?.status === 'rate_limited') {
				toast.info(
					'SMS rate limited. Please wait 15 minutes before trying again.',
					{ id: 'test-sms' },
				)
			} else {
				const friendlyError = getTelnyxErrorMessage(
					result?.error || 'Unknown error',
				)
				toast.error(friendlyError, { id: 'test-sms', duration: 8000 })
				setSmsVerified(false)
			}
		} catch (error) {
			console.error('Error sending test SMS:', error)
			const message =
				error instanceof Error ? error.message : 'Failed to send test SMS'
			toast.error(getTelnyxErrorMessage(message), { id: 'test-sms' })
			setSmsVerified(false)
		} finally {
			setIsSendingSms(false)
		}
	}

	// Count how many owners exist
	const ownerCount = users.filter(u => u.role === 'owner').length

	// Request a role change (triggers confirmation dialog)
	const requestRoleChange = (userId: string, newRole: AppRole) => {
		const user = users.find(u => u.user_id === userId)
		if (!user) return

		// Check if trying to demote the last owner
		if (user.role === 'owner' && newRole !== 'owner' && ownerCount <= 1) {
			toast.error(
				'Cannot demote the last owner. Transfer ownership first or promote another user to owner.',
			)
			return
		}

		// Show confirmation dialog
		setRoleChangeConfirm({
			open: true,
			userId,
			userName: user.full_name || user.email || 'this user',
			currentRole: user.role,
			newRole,
		})
	}

	// Confirm and execute the role change
	const confirmRoleChange = async () => {
		if (!roleChangeConfirm || !organization) return

		const { userId, newRole } = roleChangeConfirm

		try {
			await trpcClient.organizations.updateMemberRole.mutate({
				organizationId: organization.id,
				userId,
				role: newRole,
			})
			await membersQuery.refetch()
			toast.success('Role updated successfully')
		} catch (error) {
			console.error('Error updating role:', error)
			toast.error('Failed to update role')
		} finally {
			setRoleChangeConfirm(null)
		}
	}

	// Request user removal (triggers confirmation dialog)
	const requestRemoveUser = (userId: string) => {
		const user = users.find(u => u.user_id === userId)
		if (!user) return

		// Prevent removing the last owner
		if (user.role === 'owner' && ownerCount <= 1) {
			toast.error('Cannot remove the last owner. Transfer ownership first.')
			return
		}

		setRemoveUserConfirm({
			open: true,
			userId,
			userName: user.full_name || user.email || 'this user',
			role: user.role,
		})
	}

	// Confirm and execute user removal
	const confirmRemoveUser = async () => {
		if (!removeUserConfirm || !organization) return

		const { userId } = removeUserConfirm
		setRemoveUserConfirm(null)

		try {
			// First, clean up any sensors created by this user
			toast.loading("Cleaning up user's sensors...", { id: 'remove-user' })

			// First, clean up any sensors created by this user
			// For now, we'll skip sensor cleanup since there's no tRPC procedure for it yet
			// In a real implementation, you'd add a tRPC procedure for sensor cleanup

			// Remove user role
			await trpcClient.organizations.removeMember.mutate({
				organizationId: organization.id,
				userId,
			})

			await membersQuery.refetch()
			toast.success('User removed from organization', { id: 'remove-user' })
		} catch (error) {
			console.error('Error removing user:', error)
			toast.error('Failed to remove user', { id: 'remove-user' })
		}
	}

	const handleInvite = async () => {
		if (!inviteEmail || !organization) return

		// For now, just show a message - actual invite would require email functionality
		toast.info(
			`Invite functionality coming soon. Would invite ${inviteEmail} as ${inviteRole}`,
		)
		setInviteOpen(false)
		setInviteEmail('')
		setInviteRole('staff')
	}

	const canManageUsers = userRole === 'owner' || userRole === 'admin'
	const canEditOrg = userRole === 'owner' || userRole === 'admin'
	const canManageBilling = userRole === 'owner'
	const canViewDeveloperTools = ['owner', 'admin', 'manager'].includes(
		userRole || '',
	)
	const canManageTTN = userRole === 'owner' || userRole === 'admin'

	if (isLoading) {
		return (
			<DashboardLayout title='Settings'>
				<div className='flex items-center justify-center py-12'>
					<Loader2 className='w-8 h-8 animate-spin text-accent' />
				</div>
			</DashboardLayout>
		)
	}

	return (
		<DashboardLayout title='Settings'>
			<Tabs defaultValue={defaultTab} className='space-y-6'>
				<TabsList
					className={`grid w-full max-w-5xl ${canManageUsers ? 'grid-cols-9' : 'grid-cols-8'}`}
				>
					<TabsTrigger value='organization' className='flex items-center gap-2'>
						<Building2 className='w-4 h-4' />
						<span className='hidden sm:inline'>Organization</span>
					</TabsTrigger>
					<TabsTrigger value='security' className='flex items-center gap-2'>
						<Lock className='w-4 h-4' />
						<span className='hidden sm:inline'>Security</span>
					</TabsTrigger>
					<TabsTrigger value='alerts' className='flex items-center gap-2'>
						<AlertTriangle className='w-4 h-4' />
						<span className='hidden sm:inline'>Alert Rules</span>
					</TabsTrigger>
					<TabsTrigger value='billing' className='flex items-center gap-2'>
						<CreditCard className='w-4 h-4' />
						<span className='hidden sm:inline'>Billing</span>
					</TabsTrigger>
					<TabsTrigger
						value='notifications'
						className='flex items-center gap-2'
					>
						<Bell className='w-4 h-4' />
						<span className='hidden sm:inline'>Notifications</span>
					</TabsTrigger>
					<TabsTrigger value='users' className='flex items-center gap-2'>
						<Users className='w-4 h-4' />
						<span className='hidden sm:inline'>Users</span>
					</TabsTrigger>
					{canManageUsers && (
						<TabsTrigger value='gateways' className='flex items-center gap-2'>
							<Radio className='w-4 h-4' />
							<span className='hidden sm:inline'>Gateways</span>
						</TabsTrigger>
					)}
					{canManageUsers && (
						<TabsTrigger value='sensors' className='flex items-center gap-2'>
							<Thermometer className='w-4 h-4' />
							<span className='hidden sm:inline'>Sensors</span>
						</TabsTrigger>
					)}
					<TabsTrigger value='developer' className='flex items-center gap-2'>
						<Code2 className='w-4 h-4' />
						<span className='hidden sm:inline'>Developer</span>
					</TabsTrigger>
				</TabsList>

				{/* Organization Tab */}
				<TabsContent value='organization'>
					<Card>
						<CardHeader>
							<CardTitle>Organization Profile</CardTitle>
							<CardDescription>
								Manage your organization's settings and compliance preferences.
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-6'>
							<div className='grid gap-4 sm:grid-cols-2'>
								<div className='space-y-2'>
									<Label htmlFor='orgName'>Organization Name</Label>
									<Input
										id='orgName'
										value={orgName}
										onChange={e => setOrgName(e.target.value)}
										disabled={!canEditOrg}
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='orgSlug'>URL Slug</Label>
									<Input
										id='orgSlug'
										value={organization?.slug || ''}
										disabled
										className='bg-muted'
									/>
								</div>
							</div>

							<div className='grid gap-4 sm:grid-cols-2'>
								<div className='space-y-2'>
									<Label htmlFor='timezone'>Timezone</Label>
									<Select
										value={orgTimezone}
										onValueChange={setOrgTimezone}
										disabled={!canEditOrg}
									>
										<SelectTrigger>
											<SelectValue placeholder='Select timezone' />
										</SelectTrigger>
										<SelectContent>
											{timezones.map(tz => (
												<SelectItem key={tz.value} value={tz.value}>
													{tz.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='compliance'>Compliance Mode</Label>
									<Select
										value={orgCompliance}
										onValueChange={v => setOrgCompliance(v as ComplianceMode)}
										disabled={!canEditOrg}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='standard'>Standard</SelectItem>
											<SelectItem value='haccp'>HACCP</SelectItem>
										</SelectContent>
									</Select>
									<p className='text-xs text-muted-foreground'>
										HACCP mode enables stricter logging and audit requirements.
									</p>
								</div>
							</div>

							{canEditOrg && (
								<div className='flex justify-end pt-4'>
									<Button onClick={saveOrganization} disabled={isSaving}>
										{isSaving ? (
											<Loader2 className='w-4 h-4 mr-2 animate-spin' />
										) : (
											<Save className='w-4 h-4 mr-2' />
										)}
										Save Changes
									</Button>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Separator before Danger Zone */}
					<Separator className='my-8' />

					{/* Danger Zone - Account Deletion */}
					<Card
						id='danger-zone'
						className='border-destructive/50 bg-destructive/5'
					>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-destructive'>
								<AlertTriangle className='h-5 w-5' />
								Danger Zone
							</CardTitle>
							<CardDescription>
								Irreversible actions that affect your account
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
								<div className='space-y-1'>
									<p className='font-medium'>Delete Account</p>
									<p className='text-sm text-muted-foreground'>
										Permanently delete your account and all associated data
									</p>
								</div>
								{isLoading ? (
									<div className='flex items-center gap-2 text-muted-foreground'>
										<Loader2 className='h-4 w-4 animate-spin' />
										<span className='text-sm'>Loading...</span>
									</div>
								) : (
									<Button
										variant='destructive'
										onClick={() => setDeleteAccountOpen(true)}
										disabled={!stackUser || !profile}
										className='w-full sm:w-auto'
									>
										<Trash2 className='h-4 w-4 mr-2' />
										Delete Account
									</Button>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Account Deletion Modal - Always render, controls internally */}
					<AccountDeletionModal
						open={deleteAccountOpen}
						onOpenChange={setDeleteAccountOpen}
						userId={stackUser?.id || ''}
						userEmail={profile?.email || ''}
						isOwner={userRole === 'owner'}
						hasOtherUsers={hasOtherUsers}
						sensorCount={sensorCount}
						gatewayCount={gatewayCount}
					/>
				</TabsContent>

				{/* Security Tab */}
				<TabsContent value='security'>
					<SecurityTab
						currentRole={userRole}
						organizationId={organization?.id || null}
					/>
				</TabsContent>

				{/* Alert Rules Tab */}
				<TabsContent value='alerts'>
					{organization && (
						<AlertRulesScopedEditor
							organizationId={organization.id}
							canEdit={canEditOrg}
						/>
					)}
				</TabsContent>

				{/* Billing Tab */}
				<TabsContent value='billing'>
					{organization && (
						<BillingTab
							organizationId={organization.id}
							canManageBilling={canManageBilling}
						/>
					)}
				</TabsContent>

				{/* Notifications Tab */}
				<TabsContent value='notifications' className='space-y-6'>
					{/* Org-level notification settings */}
					{organization && (
						<NotificationSettingsCard
							organizationId={organization.id}
							canEdit={canEditOrg}
						/>
					)}

					{/* Personal notification preferences */}
					<Card>
						<CardHeader>
							<CardTitle>Personal Notification Preferences</CardTitle>
							<CardDescription>
								Choose how you want to receive alerts and updates for your
								account.
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-6'>
							<div className='space-y-4'>
								<div className='flex items-center justify-between rounded-lg border p-4'>
									<div className='flex items-center gap-4'>
										<div className='w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center'>
											<Bell className='w-5 h-5 text-accent' />
										</div>
										<div>
											<p className='font-medium'>Push Notifications</p>
											<p className='text-sm text-muted-foreground'>
												Receive alerts in your browser or mobile app
											</p>
										</div>
									</div>
									<Switch checked={notifPush} onCheckedChange={setNotifPush} />
								</div>

								<div className='flex items-center justify-between rounded-lg border p-4'>
									<div className='flex items-center gap-4'>
										<div className='w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center'>
											<Mail className='w-5 h-5 text-primary' />
										</div>
										<div>
											<p className='font-medium'>Email Notifications</p>
											<p className='text-sm text-muted-foreground'>
												Get alerts sent to {profile?.email}
											</p>
										</div>
									</div>
									<Switch
										checked={notifEmail}
										onCheckedChange={setNotifEmail}
									/>
								</div>

								<div className='flex items-center justify-between rounded-lg border p-4'>
									<div className='flex items-center gap-4'>
										<div className='w-10 h-10 rounded-lg bg-safe/10 flex items-center justify-center'>
											<MessageSquare className='w-5 h-5 text-safe' />
										</div>
										<div>
											<p className='font-medium'>SMS Notifications</p>
											<p className='text-sm text-muted-foreground'>
												Critical alerts via text message
											</p>
										</div>
									</div>
									<Switch checked={notifSms} onCheckedChange={setNotifSms} />
								</div>
							</div>

							{notifSms && (
								<div className='space-y-3 pt-2'>
									<Label htmlFor='phone'>Phone Number (E.164 Format)</Label>
									<div className='flex gap-2 items-start'>
										<Smartphone className='w-5 h-5 text-muted-foreground mt-2.5' />
										<div className='flex-1 max-w-xs space-y-1'>
											<div className='relative'>
												<Input
													id='phone'
													type='tel'
													placeholder='+15551234567'
													value={userPhone}
													onChange={e => {
														setUserPhone(formatPhoneForInput(e.target.value))
														setSmsVerified(null) // Reset verification status on change
													}}
													className={`${userPhone && !isValidE164(userPhone) ? 'border-destructive' : ''} ${smsVerified === true ? 'border-safe pr-8' : ''}`}
												/>
												{smsVerified === true && (
													<CheckCircle className='absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-safe' />
												)}
											</div>
											{userPhone && !isValidE164(userPhone) && (
												<p className='text-xs text-destructive'>
													Please enter a valid E.164 format (e.g., +15551234567)
												</p>
											)}
											{smsVerified === true && (
												<p className='text-xs text-safe flex items-center gap-1'>
													<CheckCircle className='h-3 w-3' />
													SMS verified - alerts will be sent to this number
												</p>
											)}
											{smsVerified === false && (
												<p className='text-xs text-warning flex items-center gap-1'>
													<AlertTriangle className='h-3 w-3' />
													SMS verification failed. Check the error message and
													try again.
												</p>
											)}
										</div>
										{canManageUsers && userPhone && isValidE164(userPhone) && (
											<Button
												variant='outline'
												size='sm'
												onClick={sendTestSms}
												disabled={isSendingSms}
												className='shrink-0'
											>
												{isSendingSms ? (
													<>
														<Loader2 className='w-3 h-3 mr-1 animate-spin' />
														Sending...
													</>
												) : (
													'Send Test SMS'
												)}
											</Button>
										)}
									</div>
									<p className='text-xs text-muted-foreground'>
										Required for SMS alerts. Use international format starting
										with + and country code. Standard messaging rates may apply.
									</p>
								</div>
							)}

							<div className='flex justify-end pt-4'>
								<Button onClick={saveNotifications} disabled={isSaving}>
									{isSaving ? (
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
									) : (
										<Save className='w-4 h-4 mr-2' />
									)}
									Save Preferences
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Webhook Status + Toll-Free Verification + Opt-In Image + SMS Alert History */}
					{canManageUsers && organization && (
						<div className='mt-6 space-y-6'>
							<TollFreeVerificationCard />
							<OptInImageStatusCard />
							<TelnyxWebhookUrlsCard />
							<WebhookStatusCard
								organizationId={organization.id}
								canEdit={canEditOrg}
							/>
							<SmsAlertHistory organizationId={organization.id} />
						</div>
					)}
				</TabsContent>

				{/* Users Tab */}
				<TabsContent value='users'>
					<Card>
						<CardHeader>
							<div className='flex items-center justify-between'>
								<div>
									<CardTitle>Team Members</CardTitle>
									<CardDescription>
										Manage users and their roles in your organization.
									</CardDescription>
								</div>
								{canManageUsers && (
									<Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
										<DialogTrigger asChild>
											<Button>
												<UserPlus className='w-4 h-4 mr-2' />
												Invite User
											</Button>
										</DialogTrigger>
										<DialogContent>
											<DialogHeader>
												<DialogTitle>Invite Team Member</DialogTitle>
												<DialogDescription>
													Send an invitation to join your organization.
												</DialogDescription>
											</DialogHeader>
											<div className='space-y-4 py-4'>
												<div className='space-y-2'>
													<Label htmlFor='inviteEmail'>Email Address</Label>
													<Input
														id='inviteEmail'
														type='email'
														placeholder='colleague@company.com'
														value={inviteEmail}
														onChange={e => setInviteEmail(e.target.value)}
													/>
												</div>
												<div className='space-y-2'>
													<Label htmlFor='inviteRole'>Role</Label>
													<Select
														value={inviteRole}
														onValueChange={v => setInviteRole(v as AppRole)}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value='admin'>Admin</SelectItem>
															<SelectItem value='manager'>Manager</SelectItem>
															<SelectItem value='staff'>Staff</SelectItem>
															<SelectItem value='viewer'>Viewer</SelectItem>
														</SelectContent>
													</Select>
												</div>
											</div>
											<DialogFooter>
												<Button
													variant='outline'
													onClick={() => setInviteOpen(false)}
												>
													Cancel
												</Button>
												<Button onClick={handleInvite}>Send Invitation</Button>
											</DialogFooter>
										</DialogContent>
									</Dialog>
								)}
							</div>
						</CardHeader>
						<CardContent>
							<div className='rounded-lg border'>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>User</TableHead>
											<TableHead>Role</TableHead>
											{canManageUsers && (
												<TableHead className='w-[100px]'>Actions</TableHead>
											)}
										</TableRow>
									</TableHeader>
									<TableBody>
										{users.map(user => {
											const role = roleConfig[user.role]
											const RoleIcon = role.icon
											const isCurrentUser = user.user_id === stackUser?.id
											const isOwner = user.role === 'owner'

											return (
												<TableRow key={user.id}>
													<TableCell>
														<div className='flex items-center gap-3'>
															<div className='w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center'>
																<User className='w-4 h-4 text-accent' />
															</div>
															<div>
																<p className='font-medium'>
																	{user.full_name || 'Unnamed User'}
																	{isCurrentUser && (
																		<span className='text-xs text-muted-foreground ml-2'>
																			(You)
																		</span>
																	)}
																</p>
																{/* Only show email to admins/owners or if it's the current user */}
																{canManageUsers || isCurrentUser ? (
																	<p className='text-sm text-muted-foreground'>
																		{user.email}
																	</p>
																) : (
																	<p className='text-sm text-muted-foreground italic'>
																		Contact info hidden
																	</p>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell>
														{canManageUsers && !isOwner && !isCurrentUser ? (
															<Select
																value={user.role}
																onValueChange={v =>
																	requestRoleChange(user.user_id, v as AppRole)
																}
															>
																<SelectTrigger className='w-[130px]'>
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value='admin'>Admin</SelectItem>
																	<SelectItem value='manager'>
																		Manager
																	</SelectItem>
																	<SelectItem value='staff'>Staff</SelectItem>
																	<SelectItem value='viewer'>Viewer</SelectItem>
																	<SelectItem value='inspector'>
																		Inspector
																	</SelectItem>
																</SelectContent>
															</Select>
														) : (
															<span
																className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${role.color}`}
															>
																<RoleIcon className='w-3 h-3 mr-1' />
																{role.label}
															</span>
														)}
													</TableCell>
													{canManageUsers && (
														<TableCell>
															{!isOwner && !isCurrentUser && (
																<Button
																	variant='ghost'
																	size='icon'
																	className='text-destructive hover:text-destructive hover:bg-destructive/10'
																	onClick={() =>
																		requestRemoveUser(user.user_id)
																	}
																>
																	<Trash2 className='w-4 h-4' />
																</Button>
															)}
														</TableCell>
													)}
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
							</div>

							<div className='mt-6 p-4 rounded-lg bg-muted/50 border border-dashed'>
								<h4 className='font-medium mb-2'>Role Permissions</h4>
								<div className='grid gap-2 text-sm text-muted-foreground'>
									<div className='flex items-center gap-2'>
										<Crown className='w-4 h-4 text-warning' />
										<span>
											<strong>Owner:</strong> Full access, billing, can transfer
											ownership
										</span>
									</div>
									<div className='flex items-center gap-2'>
										<Shield className='w-4 h-4 text-accent' />
										<span>
											<strong>Admin:</strong> Manage users, sites, devices, and
											settings
										</span>
									</div>
									<div className='flex items-center gap-2'>
										<Users className='w-4 h-4 text-primary' />
										<span>
											<strong>Manager:</strong> Manage sites and respond to
											alerts
										</span>
									</div>
									<div className='flex items-center gap-2'>
										<User className='w-4 h-4 text-safe' />
										<span>
											<strong>Staff:</strong> Log temperatures and acknowledge
											alerts
										</span>
									</div>
									<div className='flex items-center gap-2'>
										<Eye className='w-4 h-4 text-muted-foreground' />
										<span>
											<strong>Viewer:</strong> View-only access to dashboard and
											reports
										</span>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* Gateways Tab (Admin Only) */}
				{canManageUsers && organization && (
					<TabsContent value='gateways'>
						<GatewayManager
							organizationId={organization.id}
							sites={sites}
							canEdit={canManageUsers}
							ttnConfig={ttnConfig}
						/>
					</TabsContent>
				)}

				{/* Sensors Tab (Admin Only) */}
				{canManageUsers && organization && (
					<TabsContent value='sensors'>
						<SensorManager
							organizationId={organization.id}
							sites={sites}
							units={units}
							canEdit={canManageUsers}
							autoOpenAdd={action === 'add' && defaultTab === 'sensors'}
							ttnConfig={ttnConfig}
						/>
					</TabsContent>
				)}

				{/* Developer Tab - always render content, show permission message if no access */}
				<TabsContent value='developer' className='space-y-6'>
					{canViewDeveloperTools ? (
						<>
							{canManageTTN && <DebugModeToggle />}
							<TTNCredentialsPanel
								key={organization?.id || 'no-org'}
								organizationId={organization?.id || null}
								readOnly={!canManageTTN}
							/>
							<TTNConnectionSettings
								organizationId={organization?.id || null}
								readOnly={!canManageTTN}
							/>
							{canManageTTN && (
								<>
									<TTNProvisioningLogs
										organizationId={organization?.id || null}
									/>
									<EmulatorResyncCard
										organizationId={organization?.id || null}
									/>
									<EmulatorSyncHistory
										organizationId={organization?.id || null}
									/>
									<SensorSimulatorPanel
										organizationId={organization?.id || null}
									/>
								</>
							)}
						</>
					) : (
						<Card>
							<CardContent className='py-8 text-center'>
								<AlertTriangle className='h-8 w-8 mx-auto text-warning mb-4' />
								<h3 className='font-medium'>Developer Tools Unavailable</h3>
								<p className='text-sm text-muted-foreground mt-2'>
									This section requires Owner, Admin, or Manager role. Current
									role: {userRole || 'Not loaded'}
								</p>
								<p className='text-xs text-muted-foreground mt-4'>
									Debug: Org ID {organization?.id?.slice(0, 8) || 'none'}...
								</p>
							</CardContent>
						</Card>
					)}
				</TabsContent>
			</Tabs>

			{/* Role Change Confirmation Dialog */}
			<Dialog
				open={roleChangeConfirm?.open ?? false}
				onOpenChange={open => !open && setRoleChangeConfirm(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Role Change</DialogTitle>
						<DialogDescription>
							You are about to change the role for{' '}
							<strong>{roleChangeConfirm?.userName}</strong> from{' '}
							<span className='inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold mx-1'>
								{roleConfig[roleChangeConfirm?.currentRole ?? 'staff']?.label}
							</span>
							to{' '}
							<span className='inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold mx-1 text-primary border-primary/30 bg-primary/5'>
								{roleConfig[roleChangeConfirm?.newRole ?? 'staff']?.label}
							</span>
						</DialogDescription>
					</DialogHeader>
					<div className='py-4'>
						<p className='text-sm text-muted-foreground'>
							This will immediately affect what actions this user can perform in
							the organization.
						</p>
						{roleChangeConfirm?.newRole === 'admin' && (
							<p className='text-sm text-warning mt-2 flex items-center gap-2'>
								<Shield className='h-4 w-4' />
								Admins have elevated privileges and can manage users and
								settings.
							</p>
						)}
					</div>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setRoleChangeConfirm(null)}
						>
							Cancel
						</Button>
						<Button onClick={confirmRoleChange}>Confirm Change</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Remove User Confirmation Dialog */}
			<Dialog
				open={removeUserConfirm?.open ?? false}
				onOpenChange={open => !open && setRemoveUserConfirm(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2 text-destructive'>
							<Trash2 className='h-5 w-5' />
							Remove Team Member
						</DialogTitle>
						<DialogDescription>
							You are about to remove{' '}
							<strong>{removeUserConfirm?.userName}</strong> from this
							organization.
						</DialogDescription>
					</DialogHeader>
					<div className='py-4 space-y-3'>
						<p className='text-sm text-muted-foreground'>
							This will revoke their access to all organization data and
							resources. Any sensors they created will also be cleaned up.
						</p>
						<div className='p-3 bg-destructive/10 rounded-lg border border-destructive/30'>
							<p className='text-sm font-medium text-destructive'>
								This action cannot be undone.
							</p>
							<p className='text-xs text-muted-foreground mt-1'>
								The user will need to be re-invited to regain access.
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setRemoveUserConfirm(null)}
						>
							Cancel
						</Button>
						<Button variant='destructive' onClick={confirmRemoveUser}>
							Remove User
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</DashboardLayout>
	)
}

export default Settings
