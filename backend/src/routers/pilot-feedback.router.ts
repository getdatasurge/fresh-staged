import { z } from 'zod';
import * as feedbackService from '../services/pilot-feedback.service.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

const PilotFeedbackInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid().nullable(),
  weekStart: z.string(), // ISO date string
  loggingSpeedRating: z.number().int().min(1).max(5),
  alertFatigueRating: z.number().int().min(1).max(5),
  reportUsefulnessRating: z.number().int().min(1).max(5),
  notes: z.string().nullable(),
});

export const pilotFeedbackRouter = router({
  /**
   * Upsert pilot feedback for the current week
   */
  upsert: orgProcedure.input(PilotFeedbackInput).mutation(async ({ ctx, input }) => {
    return feedbackService.upsertFeedback({
      organizationId: ctx.user.organizationId,
      siteId: input.siteId,
      weekStart: input.weekStart,
      loggingSpeedRating: input.loggingSpeedRating,
      alertFatigueRating: input.alertFatigueRating,
      reportUsefulnessRating: input.reportUsefulnessRating,
      notes: input.notes,
      submittedBy: ctx.user.profileId,
    });
  }),

  /**
   * List feedback for organization
   */
  list: orgProcedure.query(async ({ ctx }) => {
    return feedbackService.listFeedback(ctx.user.organizationId);
  }),
});
