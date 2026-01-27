import { z } from 'zod'
import * as alertRulesService from '../services/alert-rules.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

// Input schemas
const AlertRulesScopeSchema = z.object({
	organizationId: z.string().uuid().optional(),
	siteId: z.string().uuid().optional(),
	unitId: z.string().uuid().optional(),
})

// Based on backend/src/db/schema/alerts.ts and frontend requirements
const AlertRulesDataSchema = z.object({
	manualIntervalMinutes: z.number().int().optional().nullable(),
	manualGraceMinutes: z.number().int().optional().nullable(),
	expectedReadingIntervalSeconds: z.number().int().optional().nullable(),
	offlineTriggerMultiplier: z.number().optional().nullable(),
	offlineTriggerAdditionalMinutes: z.number().int().optional().nullable(),
	doorOpenWarningMinutes: z.number().int().optional().nullable(),
	doorOpenCriticalMinutes: z.number().int().optional().nullable(),
	doorOpenMaxMaskMinutesPerDay: z.number().int().optional().nullable(),
	excursionConfirmMinutesDoorClosed: z.number().int().optional().nullable(),
	excursionConfirmMinutesDoorOpen: z.number().int().optional().nullable(),
	maxExcursionMinutes: z.number().int().optional().nullable(),
	offlineWarningMissedCheckins: z.number().int().optional().nullable(),
	offlineCriticalMissedCheckins: z.number().int().optional().nullable(),
	manualLogMissedCheckinsThreshold: z.number().int().optional().nullable(),
})

const GetRulesInput = AlertRulesScopeSchema

const UpsertRulesInput = AlertRulesScopeSchema.extend({
	data: AlertRulesDataSchema,
})

const DeleteRulesInput = AlertRulesScopeSchema

const ClearFieldInput = z.object({
	ruleId: z.string().uuid(),
	field: z.string(),
})

export const alertRulesRouter = router({
	get: orgProcedure.input(GetRulesInput).query(async ({ ctx, input }) => {
		const scope = {
			organizationId: ctx.user.organizationId,
			siteId: input.siteId,
			unitId: input.unitId,
		}

		// If none of siteId/unitId provided, it returns org rules?
		// Yes, service handles logic.

		const rules = await alertRulesService.getAlertRules(scope)
		return rules
	}),

	upsert: orgProcedure
		.input(UpsertRulesInput)
		.mutation(async ({ ctx, input }) => {
			const scope = {
				organizationId: ctx.user.organizationId,
				siteId: input.siteId,
				unitId: input.unitId,
			}

			// Filter out nulls if upsert doesn't like them? Drizzle allows null if column nullable.
			// But partial update...
			// The service does { ...data }.

			// Note: mapping snake_case from frontend might be needed if frontend sends it.
			// But input schema uses camelCase. Frontend must adapt.

			const rules = await alertRulesService.upsertAlertRules(
				scope,
				input.data as any,
			)
			return rules
		}),

	delete: orgProcedure
		.input(DeleteRulesInput)
		.mutation(async ({ ctx, input }) => {
			const scope = {
				organizationId: ctx.user.organizationId,
				siteId: input.siteId,
				unitId: input.unitId,
			}
			await alertRulesService.deleteAlertRules(scope)
			return { success: true }
		}),

	clearField: orgProcedure
		.input(ClearFieldInput)
		.mutation(async ({ ctx, input }) => {
			await alertRulesService.clearRuleField(input.ruleId, input.field)
			return { success: true }
		}),
})
