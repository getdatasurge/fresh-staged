import { useUser } from '@stackframe/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_LAYOUT_CONFIG, DEFAULT_TIMELINE_STATE } from '../constants/defaultLayout';
import type {
  EntityType,
  LayoutConfig,
  SavedLayout,
  TimelineState,
  WidgetPreferences,
} from '../types';
import { useTRPCClient } from '@/lib/trpc';

// Re-export EntityType for backward compatibility
export type { EntityType };

interface LayoutRow {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  userId: string;
  name: string;
  isUserDefault: boolean;
  layoutJson: unknown;
  widgetPrefsJson?: unknown;
  timelineStateJson?: unknown;
  layoutVersion: number;
  createdAt: string;
  updatedAt: string;
}

function rowToSavedLayout(row: LayoutRow): SavedLayout {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sensorId: row.entityId, // For backward compatibility - actually entityId
    entityType: row.entityType as EntityType,
    entityId: row.entityId,
    userId: row.userId,
    name: row.name,
    isUserDefault: row.isUserDefault,
    layoutJson: row.layoutJson as unknown as LayoutConfig,
    widgetPrefsJson: (row.widgetPrefsJson || {}) as unknown as WidgetPreferences,
    timelineStateJson: (row.timelineStateJson ||
      DEFAULT_TIMELINE_STATE) as unknown as TimelineState,
    layoutVersion: row.layoutVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface EntityLayoutSlot {
  slotNumber: 1 | 2 | 3;
  layoutId: string | null;
  name: string;
  isUserDefault: boolean;
}

/**
 * Hook for managing entity (unit or site) dashboard layouts.
 */
export function useEntityLayoutStorage(
  entityType: EntityType,
  entityId: string | undefined,
  organizationId: string | undefined,
) {
  const queryClient = useQueryClient();
  const user = useUser();
  const trpcClient = useTRPCClient();
  const queryKey = ['entity-layouts', entityType, entityId];

  // Fetch saved layouts for this entity
  const { data: savedLayouts = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user || !entityId) return [];

      const response = await trpcClient.dashboardLayouts.list.query({
        organizationId: organizationId!,
        entityType,
        entityId,
      });

      return response.map(rowToSavedLayout);
    },
    enabled: !!entityId && !!organizationId,
    staleTime: 1000 * 60 * 5, // 5 minutes - prevents refetch on navigation
  });

  // Get layouts mapped by slot number
  const layoutBySlot = (slot: 1 | 2 | 3): SavedLayout | null => {
    const layouts = savedLayouts as SavedLayout[];
    return (
      layouts.find((_l, idx) => {
        // Since we order by slot_number, slot 1 = index 0, etc.
        return idx + 1 === slot;
      }) || null
    );
  };

  // Check if a slot has a layout
  const hasSlot = (slot: 1 | 2 | 3): boolean => {
    return savedLayouts.length >= slot;
  };

  // Get next available slot number
  const nextAvailableSlot = (): 1 | 2 | 3 | null => {
    const count = savedLayouts.length;
    if (count >= 3) return null;
    return (count + 1) as 1 | 2 | 3;
  };

  // Save new layout mutation
  const saveLayoutMutation = useMutation({
    mutationFn: async (params: {
      slotNumber: 1 | 2 | 3;
      name: string;
      layoutJson?: LayoutConfig;
      widgetPrefsJson?: WidgetPreferences;
      timelineStateJson?: TimelineState;
    }) => {
      if (!user || !entityId || !organizationId) {
        throw new Error('Not authenticated or missing entity/org');
      }

      const response = await trpcClient.dashboardLayouts.create.mutate({
        organizationId,
        entityType,
        entityId,
        slotNumber: params.slotNumber,
        name: params.name,
        layoutJson: params.layoutJson || DEFAULT_LAYOUT_CONFIG,
        widgetPrefsJson: params.widgetPrefsJson || {},
        timelineStateJson: params.timelineStateJson || DEFAULT_TIMELINE_STATE,
      });

      return rowToSavedLayout(response);
    },
    onSuccess: (savedLayout) => {
      // Update cache directly instead of invalidating to reduce refetches
      queryClient.setQueryData(queryKey, (old: SavedLayout[] = []) => [...old, savedLayout]);
      // Only invalidate nav-tree if layout name might appear in navigation
      queryClient.invalidateQueries({
        queryKey: ['nav-tree-layouts'],
        exact: false,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create layout');
    },
  });

  // Update layout mutation
  const updateLayoutMutation = useMutation({
    mutationFn: async (params: {
      layoutId: string;
      name?: string;
      layoutJson?: LayoutConfig;
      widgetPrefsJson?: WidgetPreferences;
      timelineStateJson?: TimelineState;
    }) => {
      const response = await trpcClient.dashboardLayouts.update.mutate({
        ...params,
        organizationId: organizationId!,
      });
      return rowToSavedLayout(response);
    },
    onSuccess: (updatedLayout) => {
      // Update cache directly with the returned layout
      queryClient.setQueryData(queryKey, (old: SavedLayout[] = []) =>
        old.map((l) => (l.id === updatedLayout.id ? updatedLayout : l)),
      );
      // Only invalidate nav-tree-layouts if name might have changed
      queryClient.invalidateQueries({
        queryKey: ['nav-tree-layouts'],
        exact: false,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save layout');
    },
  });

  // Delete layout mutation
  const deleteLayoutMutation = useMutation({
    mutationFn: async (layoutId: string) => {
      await trpcClient.dashboardLayouts.remove.mutate({
        organizationId: organizationId!,
        layoutId,
      });
    },
    onSuccess: (_data, deletedLayoutId) => {
      // Update cache directly by removing the deleted layout
      queryClient.setQueryData(queryKey, (old: SavedLayout[] = []) =>
        old.filter((l) => l.id !== deletedLayoutId),
      );
      queryClient.invalidateQueries({
        queryKey: ['nav-tree-layouts'],
        exact: false,
      });
      toast.success('Layout deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete layout');
    },
  });

  // Set as default mutation
  const setAsDefaultMutation = useMutation({
    mutationFn: async (layoutId: string) => {
      await trpcClient.dashboardLayouts.setDefault.mutate({
        layoutId,
        organizationId: organizationId!,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Set as default layout');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to set default');
    },
  });

  return {
    savedLayouts: savedLayouts as SavedLayout[],
    isLoading,
    layoutBySlot,
    hasSlot,
    nextAvailableSlot,
    layoutCount: savedLayouts.length,
    canCreateNew: savedLayouts.length < 3,
    saveLayout: saveLayoutMutation.mutateAsync,
    updateLayout: updateLayoutMutation.mutateAsync,
    deleteLayout: deleteLayoutMutation.mutateAsync,
    setAsUserDefault: setAsDefaultMutation.mutateAsync,
    isSaving: saveLayoutMutation.isPending,
    isUpdating: updateLayoutMutation.isPending,
    isDeleting: deleteLayoutMutation.isPending,
  };
}
