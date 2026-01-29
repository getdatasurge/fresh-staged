import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type {
	SubscriptionPlan,
	SubscriptionResponse,
	SubscriptionStatus,
} from '@/lib/api-types'
import { PlanKey, STRIPE_PLANS } from '@/lib/stripe'
import { useTRPCClient } from '@/lib/trpc'
import { useUser } from '@stackframe/react'
import {
	AlertTriangle,
	CheckCircle,
	Clock,
	CreditCard,
	ExternalLink,
	Loader2,
	Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { InvoiceHistory } from './InvoiceHistory'
import { PlanCard } from './PlanCard'

interface BillingTabProps {
	organizationId: string
	canManageBilling: boolean
}

const statusConfig: Record<
	SubscriptionStatus,
	{ label: string; color: string; icon: React.ElementType }
> = {
	trial: {
		label: 'Trial',
		color: 'bg-warning/15 text-warning border-warning/30',
		icon: Clock,
	},
	active: {
		label: 'Active',
		color: 'bg-safe/15 text-safe border-safe/30',
		icon: CheckCircle,
	},
	past_due: {
		label: 'Past Due',
		color: 'bg-danger/15 text-danger border-danger/30',
		icon: AlertTriangle,
	},
	canceled: {
		label: 'Canceled',
		color: 'bg-muted text-muted-foreground border-border',
		icon: AlertTriangle,
	},
	paused: {
		label: 'Paused',
		color: 'bg-muted text-muted-foreground border-border',
		icon: Clock,
	},
}

export const BillingTab = ({
	organizationId,
	canManageBilling,
}: BillingTabProps) => {
	const user = useUser()
	const [searchParams, setSearchParams] = useSearchParams()
	const [subscription, setSubscription] = useState<SubscriptionResponse | null>(
		null,
	)
	const [isLoading, setIsLoading] = useState(true)
	const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(
		null,
	)
	const [isPortalLoading, setIsPortalLoading] = useState(false)

	const trpcClient = useTRPCClient()

	// Handle Stripe redirect results
	useEffect(() => {
		const sessionId = searchParams.get('session_id')
		const canceled = searchParams.get('canceled')

		if (sessionId) {
			// Checkout was successful
			toast.success('Payment successful! Your subscription has been updated.')
			// Clean up URL params
			setSearchParams({})
			// Reload subscription to show updated status
			loadSubscription()
		} else if (canceled) {
			// Checkout was canceled
			toast.info('Checkout canceled. Your subscription remains unchanged.')
			// Clean up URL params
			setSearchParams({})
		}
	}, [searchParams, setSearchParams])

	useEffect(() => {
		loadSubscription()
	}, [organizationId, user])

	const loadSubscription = async () => {
		if (!user) {
			setIsLoading(false)
			return
		}

		try {
			const data = await trpcClient.payments.getSubscription.query({ organizationId })
			setSubscription(data)
		} catch (error) {
			console.error('Error loading subscription:', error)
			// Don't show error toast for 404 - organization may not have a subscription yet
			if (error instanceof Error && !error.message.includes('404')) {
				toast.error('Failed to load subscription')
			}
		}
		setIsLoading(false)
	}

	const handleUpgrade = async (planKey: PlanKey) => {
		const plan = STRIPE_PLANS[planKey]
		if (!plan.priceId) {
			toast.info('Contact sales for Enterprise pricing')
			return
		}

		if (!user) {
			toast.error('Please sign in to upgrade')
			return
		}

		setIsCheckoutLoading(planKey)
		try {
			const { url } = await trpcClient.payments.createCheckoutSession.mutate({
				organizationId,
				data: { plan: planKey as Exclude<SubscriptionPlan, 'enterprise'> },
			})

			// Redirect to Stripe checkout in the same tab for better UX
			window.location.href = url
		} catch (error) {
			console.error('Error creating checkout:', error)
			toast.error('Failed to start checkout')
			setIsCheckoutLoading(null)
		}
	}

	const handleManageBilling = async () => {
		if (!user) {
			toast.error('Please sign in to manage billing')
			return
		}

		setIsPortalLoading(true)
		try {
			const { url } = await trpcClient.payments.createPortalSession.mutate({
				organizationId,
				data: {},
			})

			// Open portal in new tab so user can return easily
			window.open(url, '_blank')
		} catch (error) {
			console.error('Error opening portal:', error)
			toast.error('Failed to open billing portal')
		}
		setIsPortalLoading(false)
	}

	if (isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='w-8 h-8 animate-spin text-accent' />
			</div>
		)
	}

	const currentPlan = subscription?.plan || 'starter'
	const status = subscription?.status || 'trial'
	const statusInfo = statusConfig[status]
	const StatusIcon = statusInfo.icon
	const sensorLimit = subscription?.sensorLimit || 5
	const currentSensorCount = subscription?.currentSensorCount || 0
	const sensorUsage =
		sensorLimit > 0 ? Math.round((currentSensorCount / sensorLimit) * 100) : 0
	const isTrialEnding = status === 'trial' && subscription?.trialEndsAt
	const trialDaysLeft = isTrialEnding
		? Math.max(
				0,
				Math.ceil(
					(new Date(subscription.trialEndsAt!).getTime() - Date.now()) /
						(1000 * 60 * 60 * 24),
				),
			)
		: 0

	return (
		<div className='space-y-6'>
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<div>
							<CardTitle className='flex items-center gap-2'>
								<Zap className='w-5 h-5 text-accent' />
								Current Plan
							</CardTitle>
							<CardDescription>
								Manage your subscription and billing
							</CardDescription>
						</div>
						<Badge variant='outline' className={statusInfo.color}>
							<StatusIcon className='w-3 h-3 mr-1' />
							{statusInfo.label}
						</Badge>
					</div>
				</CardHeader>
				<CardContent className='space-y-6'>
					<div className='flex items-center justify-between'>
						<div>
							<h3 className='text-2xl font-bold capitalize'>
								{currentPlan} Plan
							</h3>
							<p className='text-muted-foreground'>
								{STRIPE_PLANS[currentPlan as PlanKey]?.price
									? `$${STRIPE_PLANS[currentPlan as PlanKey].price}/month`
									: 'Custom pricing'}
							</p>
						</div>
						{canManageBilling && subscription?.stripeCustomerId && (
							<Button
								variant='outline'
								onClick={handleManageBilling}
								disabled={isPortalLoading}
							>
								{isPortalLoading ? (
									<Loader2 className='w-4 h-4 mr-2 animate-spin' />
								) : (
									<CreditCard className='w-4 h-4 mr-2' />
								)}
								Manage Billing
								<ExternalLink className='w-3 h-3 ml-2' />
							</Button>
						)}
					</div>

					{isTrialEnding && (
						<div className='flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30'>
							<Clock className='w-5 h-5 text-warning' />
							<div>
								<p className='font-medium text-warning'>
									Trial ends in {trialDaysLeft} days
								</p>
								<p className='text-sm text-muted-foreground'>
									Upgrade now to continue using all features
								</p>
							</div>
						</div>
					)}

					<div className='space-y-2'>
						<div className='flex items-center justify-between text-sm'>
							<span className='text-muted-foreground'>Sensor Usage</span>
							<span className='font-medium'>
								{currentSensorCount} / {sensorLimit}
							</span>
						</div>
						<Progress value={sensorUsage} className='h-2' />
						{sensorUsage >= 80 && (
							<p className='text-xs text-warning'>
								You're approaching your sensor limit. Consider upgrading for
								more capacity.
							</p>
						)}
					</div>

					{subscription?.currentPeriodEnd && status === 'active' && (
						<p className='text-sm text-muted-foreground'>
							Next billing date:{' '}
							{new Date(subscription.currentPeriodEnd).toLocaleDateString()}
						</p>
					)}
				</CardContent>
			</Card>

			{canManageBilling && (
				<Card>
					<CardHeader>
						<CardTitle>Available Plans</CardTitle>
						<CardDescription>
							Choose the plan that best fits your needs
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
							{(
								Object.entries(STRIPE_PLANS) as [
									PlanKey,
									(typeof STRIPE_PLANS)[PlanKey],
								][]
							).map(([key, plan]) => (
								<PlanCard
									key={key}
									planKey={key}
									plan={plan}
									isCurrentPlan={currentPlan === key}
									onUpgrade={() => handleUpgrade(key)}
									isLoading={isCheckoutLoading === key}
									disabled={
										currentPlan === key ||
										!!(subscription?.stripeSubscriptionId && !plan.priceId)
									}
								/>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{subscription && <InvoiceHistory subscriptionId={subscription.id} />}
		</div>
	)
}
