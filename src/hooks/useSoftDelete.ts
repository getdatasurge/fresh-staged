import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTRPC } from '../lib/trpc'

export interface SoftDeleteResult {
	success: boolean
	error?: string
}

export function useSoftDelete() {
	const trpc = useTRPC()

	const restoreUnitMutation = useMutation(trpc.units.restore.mutationOptions())
	const restoreAreaMutation = useMutation(trpc.areas.restore.mutationOptions())
	const restoreSiteMutation = useMutation(trpc.sites.restore.mutationOptions())
	const restoreDeviceMutation = useMutation(trpc.ttnDevices.restore.mutationOptions())
	const permanentlyDeleteUnitMutation = useMutation(
		trpc.units.permanentlyDelete.mutationOptions()
	)
	const permanentlyDeleteAreaMutation = useMutation(
		trpc.areas.permanentlyDelete.mutationOptions()
	)
	const permanentlyDeleteSiteMutation = useMutation(
		trpc.sites.permanentlyDelete.mutationOptions()
	)
	const permanentlyDeleteDeviceMutation = useMutation(
		trpc.ttnDevices.permanentlyDelete.mutationOptions()
	)

	const restoreUnit = async (
		unitId: string,
		areaId: string,
		siteId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await restoreUnitMutation.mutateAsync({
				organizationId,
				siteId,
				areaId,
				unitId,
			})
			toast.success('Unit restored successfully')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to restore unit'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	const restoreArea = async (
		areaId: string,
		siteId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await restoreAreaMutation.mutateAsync({
				organizationId,
				siteId,
				areaId,
			})
			toast.success('Area restored successfully')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to restore area'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	const restoreSite = async (
		siteId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await restoreSiteMutation.mutateAsync({
				organizationId,
				siteId,
			})
			toast.success('Site restored successfully')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to restore site'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	const restoreDevice = async (
		deviceId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await restoreDeviceMutation.mutateAsync({
				organizationId,
				deviceId,
			})
			toast.success('Device restored successfully')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to restore device'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	// Sensors are treated as devices in the codebase
	const restoreSensor = async (
		sensorId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		return restoreDevice(sensorId, organizationId)
	}

	const permanentlyDeleteUnit = async (
		unitId: string,
		areaId: string,
		siteId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await permanentlyDeleteUnitMutation.mutateAsync({
				organizationId,
				siteId,
				areaId,
				unitId,
			})
			toast.success('Unit permanently deleted')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to permanently delete unit'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	const permanentlyDeleteArea = async (
		areaId: string,
		siteId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await permanentlyDeleteAreaMutation.mutateAsync({
				organizationId,
				siteId,
				areaId,
			})
			toast.success('Area permanently deleted')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to permanently delete area'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	const permanentlyDeleteSite = async (
		siteId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await permanentlyDeleteSiteMutation.mutateAsync({
				organizationId,
				siteId,
			})
			toast.success('Site permanently deleted')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to permanently delete site'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	const permanentlyDeleteDevice = async (
		deviceId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		try {
			await permanentlyDeleteDeviceMutation.mutateAsync({
				organizationId,
				deviceId,
			})
			toast.success('Device permanently deleted')
			return { success: true }
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to permanently delete device'
			toast.error(message)
			return { success: false, error: message }
		}
	}

	// Sensors are treated as devices in the codebase
	const permanentlyDeleteSensor = async (
		sensorId: string,
		organizationId: string,
	): Promise<SoftDeleteResult> => {
		return permanentlyDeleteDevice(sensorId, organizationId)
	}

	return {
		restoreUnit,
		restoreArea,
		restoreSite,
		restoreDevice,
		restoreSensor,
		permanentlyDeleteUnit,
		permanentlyDeleteArea,
		permanentlyDeleteSite,
		permanentlyDeleteDevice,
		permanentlyDeleteSensor,
	}
}
