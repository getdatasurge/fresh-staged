import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pilotFeedback, type InsertPilotFeedback, type PilotFeedback } from '../db/schema/pilot-feedback.js';

/**
 * Upsert pilot feedback for an organization
 */
export async function upsertFeedback(
  data: Omit<InsertPilotFeedback, 'id' | 'createdAt'>
): Promise<PilotFeedback> {
  const [result] = await db
    .insert(pilotFeedback)
    .values(data)
    .onConflictDoUpdate({
      target: [pilotFeedback.organizationId, pilotFeedback.siteId, pilotFeedback.weekStart],
      set: {
        loggingSpeedRating: data.loggingSpeedRating,
        alertFatigueRating: data.alertFatigueRating,
        reportUsefulnessRating: data.reportUsefulnessRating,
        notes: data.notes,
        submittedBy: data.submittedBy,
      },
    })
    .returning();

  return result;
}

/**
 * List feedback for an organization
 */
export async function listFeedback(organizationId: string): Promise<PilotFeedback[]> {
  return db
    .select()
    .from(pilotFeedback)
    .where(eq(pilotFeedback.organizationId, organizationId))
    .orderBy(sql`${pilotFeedback.weekStart} DESC`);
}
