/**
 * Temperature Heatmap Widget
 *
 * Displays a grid of all units in the site with temperature status colors.
 * Clicking a unit navigates to its dashboard.
 */

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTRPC } from '@/lib/trpc'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WidgetProps } from '../types'

interface UnitHeatmapData {
	id: string
	name: string
	lastTemperature: number | null
	tempMax: number
	tempMin: number | null
	lastReadingAt: string | null
	status: 'ok' | 'warning' | 'critical' | 'offline'
}

const INITIAL_DISPLAY_COUNT = 24

export function TemperatureHeatmapWidget({
	site,
	organizationId,
}: WidgetProps) {
	const navigate = useNavigate()
	const [showAll, setShowAll] = useState(false)
	const trpc = useTRPC()

	// Fetch all units for the site
	const queryOptions = trpc.units.listByOrg.queryOptions({
		organizationId,
	})

	const { data: allUnits = [], isLoading } = useQuery({
		...queryOptions,
		enabled: !!site?.id && !!organizationId,
		staleTime: 60000,
	})

	// Filter units to only those in the current site
	const units = allUnits.filter(unit => unit.siteId === site?.id)

	// Process units into heatmap data
	const heatmapData: UnitHeatmapData[] = useMemo(() => {
		if (!units) return []

		const now = Date.now()
		const offlineThresholdMs = 2 * 60 * 60 * 1000 // 2 hours

		return units.map(unit => {
			const lastReadingTime = unit.lastReadingAt
				? new Date(unit.lastReadingAt).getTime()
				: 0
			const isOffline =
				!unit.lastReadingAt || now - lastReadingTime > offlineThresholdMs

			let status: UnitHeatmapData['status'] = 'ok'

			if (isOffline) {
				status = 'offline'
			} else if (unit.lastTemperature !== null) {
				const temp = unit.lastTemperature
				const high = unit.tempMax
				const low = unit.tempMin ?? -Infinity

				// Warning: within 2 degrees of limit
				const warningBuffer = 2

				if (temp > high || temp < low) {
					status = 'critical'
				} else if (temp > high - warningBuffer || temp < low + warningBuffer) {
					status = 'warning'
				}
			}

			return { ...unit, status }
		})
	}, [units])

	// Display subset or all
	const displayedUnits = showAll
		? heatmapData
		: heatmapData.slice(0, INITIAL_DISPLAY_COUNT)
	const hasMore = heatmapData.length > INITIAL_DISPLAY_COUNT

	// Get status color
	const getStatusColor = (status: UnitHeatmapData['status']) => {
		switch (status) {
			case 'ok':
				return 'bg-green-500/20 border-green-500/40 text-green-700 dark:text-green-400'
			case 'warning':
				return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-700 dark:text-yellow-400'
			case 'critical':
				return 'bg-red-500/20 border-red-500/40 text-red-700 dark:text-red-400'
			case 'offline':
				return 'bg-gray-500/20 border-gray-500/40 text-gray-500'
		}
	}

	if (isLoading) {
		return (
			<Card className='h-full flex flex-col'>
				<CardHeader className='pb-2'>
					<CardTitle className='text-sm font-medium flex items-center gap-2'>
						<LayoutGrid className='h-4 w-4' />
						Temperature Heatmap
					</CardTitle>
				</CardHeader>
				<CardContent className='flex-1'>
					<div className='grid grid-cols-4 gap-2'>
						{[...Array(12)].map((_, i) => (
							<Skeleton key={i} className='h-16 rounded' />
						))}
					</div>
				</CardContent>
			</Card>
		)
	}

	if (!heatmapData.length) {
		return (
			<Card className='h-full flex flex-col'>
				<CardHeader className='pb-2'>
					<CardTitle className='text-sm font-medium flex items-center gap-2'>
						<LayoutGrid className='h-4 w-4' />
						Temperature Heatmap
					</CardTitle>
				</CardHeader>
				<CardContent className='flex-1 flex items-center justify-center'>
					<p className='text-sm text-muted-foreground'>No units in this site</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className='h-full flex flex-col'>
			<CardHeader className='pb-2'>
				<div className='flex items-center justify-between'>
					<CardTitle className='text-sm font-medium flex items-center gap-2'>
						<LayoutGrid className='h-4 w-4' />
						Temperature Heatmap
					</CardTitle>
					<div className='flex gap-2 text-xs'>
						<span className='flex items-center gap-1'>
							<span className='w-2 h-2 rounded-full bg-green-500' /> OK
						</span>
						<span className='flex items-center gap-1'>
							<span className='w-2 h-2 rounded-full bg-yellow-500' /> Warning
						</span>
						<span className='flex items-center gap-1'>
							<span className='w-2 h-2 rounded-full bg-red-500' /> Critical
						</span>
						<span className='flex items-center gap-1'>
							<span className='w-2 h-2 rounded-full bg-gray-500' /> Offline
						</span>
					</div>
				</div>
			</CardHeader>
			<CardContent className='flex-1 flex flex-col gap-2 overflow-hidden'>
				<ScrollArea className='flex-1'>
					<TooltipProvider>
						<div className='grid grid-cols-4 sm:grid-cols-6 gap-2 pr-4'>
							{displayedUnits.map(unit => (
								<Tooltip key={unit.id}>
									<TooltipTrigger asChild>
										<button
											onClick={() => navigate(`/units/${unit.id}`)}
											className={`p-2 rounded border text-left transition-colors hover:opacity-80 ${getStatusColor(unit.status)}`}
										>
											<p className='text-xs font-medium truncate'>
												{unit.name}
											</p>
											<p className='text-lg font-bold'>
												{unit.status === 'offline'
													? '—'
													: unit.lastTemperature !== null
														? `${unit.lastTemperature.toFixed(1)}°`
														: '—'}
											</p>
										</button>
									</TooltipTrigger>
									<TooltipContent>
										<div className='text-xs'>
											<p className='font-medium'>{unit.name}</p>
											{unit.lastTemperature !== null && (
												<p>Temperature: {unit.lastTemperature.toFixed(1)}°</p>
											)}
											<p>
												Limits: {unit.tempMin ?? '—'}° to {unit.tempMax}°
											</p>
											{unit.lastReadingAt && (
												<p>
													Last reading:{' '}
													{format(
														new Date(unit.lastReadingAt),
														'MMM d, h:mm a',
													)}
												</p>
											)}
										</div>
									</TooltipContent>
								</Tooltip>
							))}
						</div>
					</TooltipProvider>
				</ScrollArea>

				{hasMore && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => setShowAll(!showAll)}
						className='w-full'
					>
						{showAll ? (
							<>
								<ChevronUp className='h-4 w-4 mr-1' />
								Show less
							</>
						) : (
							<>
								<ChevronDown className='h-4 w-4 mr-1' />
								Show all {heatmapData.length} units
							</>
						)}
					</Button>
				)}
			</CardContent>
		</Card>
	)
}
