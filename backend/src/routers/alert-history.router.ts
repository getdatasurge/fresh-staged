import { z } from 'zod'
import * as alertHistoryService from '../services/alert-history.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

const GetHistoryInput = z.object({
  organizationId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(20),
});

const CreateHistoryInput = z.object({
  alertRuleId: z.string().uuid(),
  action: z.string(),
  changes: z.record(z.unknown()),
  oldValues: z.record(z.unknown()).optional(),
});

export const alertHistoryRouter = router({
  get: orgProcedure
    .input(GetHistoryInput)
    .query(async ({ ctx, input }) => {
      const scope = {
        organizationId: ctx.user.organizationId,
        siteId: input.siteId,
        unitId: input.unitId,
      };

      return alertHistoryService.getAlertHistory(scope, input.limit);
    }),

  create: orgProcedure
    .input(CreateHistoryInput)
    .mutation(async ({ ctx, input }) => {
      await alertHistoryService.createHistory(ctx.user.id, {
        alertRuleId: input.alertRuleId,
        changeType: input.action,
        newValues: input.changes,
        oldValues: input.oldValues,
      });
    }),
});
