import { toast } from "sonner";
import type { LayoutConfig, TimelineState, WidgetPreferences, SavedLayout, EntityType } from "../types";

// Re-export EntityType for backward compatibility
export type { EntityType };

export interface EntityLayoutSlot {
  slotNumber: 1 | 2 | 3;
  layoutId: string | null;
  name: string;
  isUserDefault: boolean;
}

/**
 * Hook for managing entity (unit or site) dashboard layouts.
 *
 * Layout storage is disabled while Supabase is removed.
 */
export function useEntityLayoutStorage(
  _entityType: EntityType,
  _entityId: string | undefined,
  _organizationId: string | undefined
) {
  const unavailable = async () => {
    const message = "Dashboard layouts are unavailable during Supabase removal.";
    toast.error(message);
    throw new Error(message);
  };

  const layoutBySlot = (_slot: 1 | 2 | 3): SavedLayout | null => null;
  const hasSlot = (_slot: 1 | 2 | 3): boolean => false;
  const nextAvailableSlot = (): 1 | 2 | 3 | null => null;

  return {
    savedLayouts: [] as SavedLayout[],
    isLoading: false,
    layoutBySlot,
    hasSlot,
    nextAvailableSlot,
    layoutCount: 0,
    canCreateNew: false,
    saveLayout: unavailable as (params: {
      slotNumber: 1 | 2 | 3;
      name: string;
      layoutJson?: LayoutConfig;
      widgetPrefsJson?: WidgetPreferences;
      timelineStateJson?: TimelineState;
    }) => Promise<SavedLayout>,
    updateLayout: unavailable as (params: {
      layoutId: string;
      name?: string;
      layoutJson?: LayoutConfig;
      widgetPrefsJson?: WidgetPreferences;
      timelineStateJson?: TimelineState;
    }) => Promise<SavedLayout>,
    deleteLayout: unavailable as (layoutId: string) => Promise<void>,
    setAsUserDefault: unavailable as (layoutId: string) => Promise<void>,
    isSaving: false,
    isUpdating: false,
    isDeleting: false,
  };
}
