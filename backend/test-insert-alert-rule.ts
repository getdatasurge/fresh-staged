import type { InsertAlertRule } from './src/db/schema/alerts.js'

console.log('InsertAlertRule type:', typeof InsertAlertRule)
console.log('InsertAlertRule properties:', Object.keys(InsertAlertRule || {}))

// Let's try to create an example object
const example: InsertAlertRule = {
	organizationId: '123e4567-e89b-12d3-a456-426614174000',
	name: 'Test Rule',
	tempMin: 0,
	tempMax: 100,
	delayMinutes: 5,
	manualIntervalMinutes: 60,
	manualGraceMinutes: 10,
	expectedReadingIntervalSeconds: 300,
	offlineTriggerMultiplier: 2,
	offlineTriggerAdditionalMinutes: 5,
	offlineWarningMissedCheckins: 2,
	offlineCriticalMissedCheckins: 4,
	manualLogMissedCheckinsThreshold: 3,
	doorOpenWarningMinutes: 10,
	doorOpenCriticalMinutes: 30,
	doorOpenMaxMaskMinutesPerDay: 60,
	excursionConfirmMinutesDoorClosed: 2,
	excursionConfirmMinutesDoorOpen: 5,
	maxExcursionMinutes: 60,
	alertType: 'alarm_active',
	severity: 'warning',
	isEnabled: true,
}

console.log('Example object:', example)
