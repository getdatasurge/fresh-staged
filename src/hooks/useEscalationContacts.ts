/**
 * Escalation Contacts Domain Hooks
 *
 * TODO: Migrate to tRPC when escalationContacts router is available
 * - Backend router not yet created (escalationContacts.router.ts)
 * - Currently uses Supabase for data access
 * - Planned for future Phase when backend router is available
 *
 * Current status: Stack Auth for identity, Supabase for data (Phase 21)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY
import { qk } from "@/lib/queryKeys";
import { invalidateEscalationContacts } from "@/lib/invalidation";
import { useOrgScope } from "@/hooks/useOrgScope";

export interface EscalationContact {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  priority: number;
  notification_channels: string[];
  is_active: boolean;
  user_id: string | null;
  created_at: string;
}

/**
 * Hook to fetch escalation contacts for the current organization.
 * Uses org-scoped query key for proper cache invalidation on impersonation.
 */
export function useEscalationContacts() {
  const { orgId, isReady } = useOrgScope();
  const user = useUser();

  return useQuery({
    queryKey: qk.org(orgId).escalationContacts(),
    queryFn: async () => {
      if (!orgId || !user) return [];

      // TODO Phase 6: Migrate to new API when backend endpoint available
      // Using Supabase directly for now (Stack Auth handles identity)
      const { data, error } = await supabase
        .from("escalation_contacts")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("priority", { ascending: true });
      if (error) {
        console.error('[useEscalationContacts] Supabase error:', error);
        throw error;
      }
      return data as EscalationContact[];
    },
    enabled: isReady && !!user,
  });
}

export function useCreateEscalationContact() {
  const queryClient = useQueryClient();
  const { orgId } = useOrgScope();
  const user = useUser();

  return useMutation({
    mutationFn: async (contact: Omit<EscalationContact, "id" | "created_at">) => {
      if (!orgId || !user) throw new Error('Not authenticated');

      // TODO Phase 6: Migrate to new API
      const { data, error } = await supabase
        .from("escalation_contacts")
        .insert(contact)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      if (orgId) {
        await invalidateEscalationContacts(queryClient, orgId);
      }
    },
  });
}

export function useUpdateEscalationContact() {
  const queryClient = useQueryClient();
  const { orgId } = useOrgScope();
  const user = useUser();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EscalationContact> & { id: string }) => {
      if (!orgId || !user) throw new Error('Not authenticated');

      // TODO Phase 6: Migrate to new API
      const { error } = await supabase
        .from("escalation_contacts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (orgId) {
        await invalidateEscalationContacts(queryClient, orgId);
      }
    },
  });
}

export function useDeleteEscalationContact() {
  const queryClient = useQueryClient();
  const { orgId } = useOrgScope();
  const user = useUser();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId || !user) throw new Error('Not authenticated');

      // TODO Phase 6: Migrate to new API
      const { error } = await supabase
        .from("escalation_contacts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (orgId) {
        await invalidateEscalationContacts(queryClient, orgId);
      }
    },
  });
}
