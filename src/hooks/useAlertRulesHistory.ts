import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AlertRulesHistoryEntry {
  id: string;
  alertRuleId: string | null;
  changeType: string;
  oldValues: string | null;
  newValues: string | null;
  changedAt: string;
  changedBy: string | null;
  userEmail: string | null;
  userName: string | null;
  // Mapped for frontend compatibility if needed
  action?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string | null;
}

export function useAlertRulesHistory(
  scope: { organizationId?: string; siteId?: string; unitId?: string },
  limit: number = 20
) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.alertHistory.get.queryOptions(
      { ...scope, limit },
      { enabled: !!(scope.organizationId || scope.siteId || scope.unitId) }
    ),
    select: (data) => {
      return data.map(entry => ({
        ...entry,
        // Map backend response to frontend interface if needed
        action: entry.changeType,
        changes: entry.newValues ? JSON.parse(entry.newValues) : {}, // Assuming basic storage
        // Note: oldValues/newValues are strings in DB?
        // In service we select them. If they are JSON type in DB, Drizzle returns object?
        // Schema says text. So string.
        // Frontend expects 'changes' object.
        // Wait, history input was `changes`.
        // Backend `createHistory` stores `newValues`.
        // We need to robustly parse.
      }));
    }
  });
}

export function useInsertAlertRulesHistory() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      scope: { organizationId?: string; siteId?: string; unitId?: string },
      alertRuleId: string,
      action: string,
      changes: Record<string, unknown>,
      note?: string,
      userId?: string // Unused, strictly context
    }) => {
      return trpcClient.alertHistory.create.mutate({
        alertRuleId: args.alertRuleId,
        action: args.action,
        changes: args.changes,
        organizationId: args.scope.organizationId,
        siteId: args.scope.siteId,
        unitId: args.scope.unitId,
        // oldValues? Frontend passes diff in 'changes' usually?
        // AlertRulesEditor passes `changes` as { field: { from, to } }.
        // We pass this as `changes` (newValues in backend).
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['alertHistory']] });
    }
  });
}

// Deprecated: For compatibility during migration if needed, but we replace usage in AlertRulesEditor
// So we don't strictly need to export it if we update callers.
