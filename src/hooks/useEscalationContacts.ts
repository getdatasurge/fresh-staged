/**
 * Escalation Contacts Domain Hooks
 *
 * Migrated to tRPC in Phase 21
 * Uses escalationContacts router for CRUD operations
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
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
  const trpc = useTRPC();

  return useQuery({
    queryKey: qk.org(orgId).escalationContacts(),
    queryFn: async () => {
      if (!orgId || !user) return [];

      // Query via tRPC
      const data = await trpc.client.escalationContacts.list.query({
        organizationId: orgId,
      });

      // Map backend response to frontend EscalationContact interface
      return data.map((contact) => ({
        id: contact.id,
        organization_id: contact.organizationId,
        name: contact.name,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        priority: contact.priority,
        notification_channels: contact.notificationChannels,
        is_active: contact.isActive,
        user_id: contact.userId ?? null,
        created_at: contact.createdAt,
      })) as EscalationContact[];
    },
    enabled: isReady && !!user && !!orgId,
  });
}

export function useCreateEscalationContact() {
  const queryClient = useQueryClient();
  const { orgId } = useOrgScope();
  const user = useUser();
  const client = useTRPCClient();

  return useMutation({
    mutationFn: async (contact: Omit<EscalationContact, "id" | "created_at">) => {
      if (!orgId || !user) throw new Error('Not authenticated');

      return client.escalationContacts.create.mutate({
        organizationId: orgId,
        data: {
          name: contact.name,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          priority: contact.priority,
          notificationChannels: contact.notification_channels,
          isActive: contact.is_active,
          userId: contact.user_id ?? undefined,
        },
      });
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
  const client = useTRPCClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EscalationContact> & { id: string }) => {
      if (!orgId || !user) throw new Error('Not authenticated');

      return client.escalationContacts.update.mutate({
        organizationId: orgId,
        contactId: id,
        data: {
          name: updates.name,
          email: updates.email ?? undefined,
          phone: updates.phone ?? undefined,
          priority: updates.priority,
          notificationChannels: updates.notification_channels,
          isActive: updates.is_active,
          userId: updates.user_id ?? undefined,
        },
      });
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
  const client = useTRPCClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId || !user) throw new Error('Not authenticated');

      return client.escalationContacts.delete.mutate({
        organizationId: orgId,
        contactId: id,
      });
    },
    onSuccess: async () => {
      if (orgId) {
        await invalidateEscalationContacts(queryClient, orgId);
      }
    },
  });
}
