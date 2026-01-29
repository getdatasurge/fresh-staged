import PlatformLayout from '@/components/platform/PlatformLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSuperAdmin } from '@/contexts/SuperAdminContext'
import { useTRPC } from '@/lib/trpc'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
	Building2,
	Calendar,
	ExternalLink,
	Eye,
	Globe,
	MapPin,
	Shield,
	Thermometer,
	User,
	Users,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

export default function PlatformOrganizationDetail() {
	const { orgId } = useParams<{ orgId: string }>()
	const {
		logSuperAdminAction,
		setViewingOrg,
		isSupportModeActive,
		startImpersonation,
	} = useSuperAdmin()
	const trpc = useTRPC()

	const orgQuery = useQuery(
		trpc.admin.getOrganization.queryOptions(
			{ organizationId: orgId || '' },
			{ enabled: !!orgId }
		)
	)

	const hasLoggedOrgRef = useRef(false)

	// Handle side effects
	useEffect(() => {
		if (orgQuery.data && !hasLoggedOrgRef.current) {
			hasLoggedOrgRef.current = true
			setViewingOrg(orgQuery.data.id, orgQuery.data.name)
			logSuperAdminAction(
				'VIEWED_ORGANIZATION_DETAIL',
				'organization',
				orgQuery.data.id,
				orgQuery.data.id,
				{ org_name: orgQuery.data.name },
			)
		}
	}, [orgQuery.data, setViewingOrg, logSuperAdminAction])

	const organization = orgQuery.data
	const isLoading = orgQuery.isLoading

	const handleViewAsUser = async (user: any) => {
		if (!isSupportModeActive || !organization) return

		await startImpersonation(
			user.userId,
			user.email || 'Unknown',
			user.fullName || user.email || 'Unknown',
			organization.id,
			organization.name,
		)
	}

	if (isLoading || !organization) {
		return (
			<PlatformLayout
				title='Organization Details'
				showBack
				backHref='/platform/organizations'
			>
				<div className='flex items-center justify-center py-12'>
					<div className='text-muted-foreground'>
						Loading organization details...
					</div>
				</div>
			</PlatformLayout>
		)
	}

	const users = organization.users || []
	const sites = organization.sites || []

	return (
		<PlatformLayout
			title={organization.name}
			showBack
			backHref='/platform/organizations'
		>
			{/* Organization Overview */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
							<Users className='w-4 h-4' />
							Users
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{users.length}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
							<MapPin className='w-4 h-4' />
							Sites
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{sites.length}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
							<Thermometer className='w-4 h-4' />
							Units
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{organization.unitsCount || 0}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-2'>
							<Shield className='w-4 h-4' />
							Compliance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<span
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
								organization.complianceMode === 'haccp'
									? 'border-transparent bg-primary text-primary-foreground'
									: 'border-transparent bg-secondary text-secondary-foreground'
							}`}
						>
							{organization.complianceMode || 'standard'}
						</span>
					</CardContent>
				</Card>
			</div>

			{/* Organization Info Card */}
			<Card className='mb-6'>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<Building2 className='w-5 h-5' />
						Organization Information
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
						<div>
							<dt className='text-sm text-muted-foreground'>Slug</dt>
							<dd className='font-mono text-sm'>{organization.slug}</dd>
						</div>
						<div>
							<dt className='text-sm text-muted-foreground'>Timezone</dt>
							<dd className='flex items-center gap-1'>
								<Globe className='w-3 h-3' />
								{organization.timezone}
							</dd>
						</div>
						<div>
							<dt className='text-sm text-muted-foreground'>Created</dt>
							<dd className='flex items-center gap-1'>
								<Calendar className='w-3 h-3' />
								{new Date(organization.createdAt).toLocaleDateString()}
							</dd>
						</div>
						<div>
							<dt className='text-sm text-muted-foreground'>ID</dt>
							<dd className='font-mono text-xs truncate'>{organization.id}</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			{/* Tabs for Users and Sites */}
			<Tabs defaultValue='users'>
				<TabsList>
					<TabsTrigger value='users'>Users ({users.length})</TabsTrigger>
					<TabsTrigger value='sites'>Sites ({sites.length})</TabsTrigger>
				</TabsList>

				<TabsContent value='users' className='mt-4'>
					<Card>
						<CardContent className='p-0'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>User</TableHead>
										<TableHead>Email</TableHead>
										<TableHead>Role</TableHead>
										<TableHead>Phone</TableHead>
										{isSupportModeActive && (
											<TableHead className='w-24'>Actions</TableHead>
										)}
									</TableRow>
								</TableHeader>
								<TableBody>
									{users.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={isSupportModeActive ? 5 : 4}
												className='text-center py-8 text-muted-foreground'
											>
												No users in this organization
											</TableCell>
										</TableRow>
									) : (
										users.map((user: any) => (
											<TableRow key={user.userId}>
												<TableCell>
													<div className='flex items-center gap-2'>
														<User className='w-4 h-4 text-muted-foreground' />
														<span className='font-medium'>
															{user.fullName || 'No name'}
														</span>
													</div>
												</TableCell>
												<TableCell>{user.email || 'No email'}</TableCell>
												<TableCell>
													<span
														className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
															user.role === 'owner'
																? 'border-transparent bg-primary text-primary-foreground'
																: 'border-transparent bg-secondary text-secondary-foreground'
														}`}
													>
														{user.role}
													</span>
												</TableCell>
												<TableCell className='text-muted-foreground'>
													{user.phone || '-'}
												</TableCell>
												{isSupportModeActive && (
													<TableCell>
														<div className='flex items-center gap-1'>
															<Link to={`/platform/users/${user.userId}`}>
																<Button variant='ghost' size='sm'>
																	<ExternalLink className='w-3 h-3' />
																</Button>
															</Link>
															<Button
																variant='ghost'
																size='sm'
																onClick={() => handleViewAsUser(user)}
																title='View as this user'
															>
																<Eye className='w-3 h-3' />
															</Button>
														</div>
													</TableCell>
												)}
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value='sites' className='mt-4'>
					<Card>
						<CardContent className='p-0'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Site</TableHead>
										<TableHead>Address</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className='w-12'></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sites.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={4}
												className='text-center py-8 text-muted-foreground'
											>
												No sites in this organization
											</TableCell>
										</TableRow>
									) : (
										sites.map((site: any) => (
											<TableRow key={site.id}>
												<TableCell>
													<div className='flex items-center gap-2'>
														<MapPin className='w-4 h-4 text-muted-foreground' />
														<span className='font-medium'>{site.name}</span>
													</div>
												</TableCell>
												<TableCell className='text-muted-foreground'>
													{site.address || '-'}
												</TableCell>
												<TableCell>
													<span
														className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
															site.isActive
																? 'border-transparent bg-primary text-primary-foreground'
																: 'border-transparent bg-secondary text-secondary-foreground'
														}`}
													>
														{site.isActive ? 'Active' : 'Inactive'}
													</span>
												</TableCell>
												<TableCell>
													<Button variant='ghost' size='icon' disabled>
														<Eye className='w-4 h-4' />
													</Button>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</PlatformLayout>
	)
}
