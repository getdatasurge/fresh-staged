import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@stackframe/react';
import { toast } from 'sonner';
import { qk } from '@/lib/queryKeys';
import { invalidateLayouts } from '@/lib/invalidation';

export type EntityType = 'unit' | 'site';

interface CreateLayoutParams {
  entityType: EntityType;
  entityId: string;
  organizationId: string;
  slotNumber: 1 | 2 | 3;
  name?: string;
}

interface CreatedLayout {
  id: string;
  name: string;
  entityType: EntityType;
  entityId: string;
  slotNumber: 1 | 2 | 3;
}

/**
 * Hook for quickly creating a new layout from the sidebar.
 * Creates a layout with default configuration for either a unit or site.
 */
export function useQuickCreateEntityLayout() {
  const user = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_params: CreateLayoutParams): Promise<CreatedLayout> => {
      if (!user) throw new Error('Not authenticated');
      throw new Error('Dashboard layouts are unavailable during Supabase removal');
    },
    onSuccess: async (data, variables) => {
      // Use centralized layout invalidation
      await invalidateLayouts(
        queryClient,
        data.entityType,
        data.entityId,
        variables.organizationId,
      );
      toast.success(`Created "${data.name}"`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create layout');
    },
  });
}
