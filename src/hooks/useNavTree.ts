import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Layout slot for navigation display
 */
export interface LayoutSlot {
  slotNumber: 1 | 2 | 3;
  layoutId: string | null;
  name: string;
  isUserDefault: boolean;
}

/**
 * Unit navigation item (without sensor nesting)
 */
export interface UnitNavItem {
  unitId: string;
  unitName: string;
  unitType: string;
  status: string;
  areaId: string;
  areaName: string;
  siteId: string;
  siteName: string;
  layouts: LayoutSlot[];
  sensorCount: number;
}

/**
 * Site navigation item
 */
export interface SiteNavItem {
  siteId: string;
  siteName: string;
  layouts: LayoutSlot[];
  units: UnitNavItem[];
}

/**
 * Complete navigation tree
 */
export interface NavTree {
  sites: SiteNavItem[];
  hasSingleSite: boolean;
  isLoading: boolean;
  error: Error | null;
}

interface RawSensor {
  id: string;
  unit_id: string;
}

interface RawLayout {
  id: string;
  entity_type: string;
  entity_id: string;
  slot_number: number;
  name: string;
  is_user_default: boolean;
}

/**
 * Map layouts to fixed 3-slot structure
 */
function mapLayoutsToSlots(layouts: RawLayout[]): LayoutSlot[] {
  const slots: LayoutSlot[] = [];

  // Sort by slot_number
  const sorted = [...layouts].sort((a, b) => a.slot_number - b.slot_number);

  for (const layout of sorted) {
    if (layout.slot_number >= 1 && layout.slot_number <= 3) {
      slots.push({
        slotNumber: layout.slot_number as 1 | 2 | 3,
        layoutId: layout.id,
        name: layout.name,
        isUserDefault: layout.is_user_default,
      });
    }
  }

  return slots;
}

/**
 * Hook to fetch the complete navigation tree for the sidebar.
 * Structure: Sites > Units > Layouts
 *
 * Uses org-scoped query keys for proper cache invalidation on impersonation switch.
 */
export function useNavTree(organizationId: string | null): NavTree {
  const DEV = import.meta.env.DEV;
  const trpc = useTRPC();

  // Debug logging for impersonation context
  DEV && console.log('[useNavTree] Called with organizationId:', organizationId);

  // Fetch all sites for this organization via tRPC
  const sitesQuery = useQuery(
    trpc.sites.list.queryOptions(
      { organizationId: organizationId! },
      {
        enabled: !!organizationId,
        staleTime: 1000 * 30,
      },
    ),
  );

  // Fetch all units for this organization via tRPC
  const unitsQuery = useQuery(
    trpc.units.listByOrg.queryOptions(
      { organizationId: organizationId! },
      {
        enabled: !!organizationId,
        staleTime: 1000 * 30,
      },
    ),
  );

  // Build navigation tree
  const sites: SiteNavItem[] = useMemo(() => {
    const allSites = sitesQuery.data || [];
    const unitsData = unitsQuery.data || [];

    // Group units by site
    const siteMap = new Map<string, SiteNavItem>();

    // First, add all sites (even those without units)
    for (const site of allSites) {
      if (!siteMap.has(site.id)) {
        siteMap.set(site.id, {
          siteId: site.id,
          siteName: site.name,
          layouts: [], // Layouts will be fetched per entity
          units: [],
        });
      }
    }

    // Add units to their sites
    for (const unit of unitsData) {
      if (!siteMap.has(unit.siteId)) {
        siteMap.set(unit.siteId, {
          siteId: unit.siteId,
          siteName: '', // Will be populated from sites data
          layouts: [],
          units: [],
        });
      }

      // Get site name from sites data
      const site = allSites.find((s) => s.id === unit.siteId);
      const siteName = site?.name || 'Unknown Site';

      const unitItem: UnitNavItem = {
        unitId: unit.id,
        unitName: unit.name,
        unitType: unit.unitType,
        status: unit.status,
        areaId: unit.areaId,
        areaName: unit.areaName,
        siteId: unit.siteId,
        siteName: siteName,
        layouts: [], // Layouts will be fetched per entity
        sensorCount: 0, // Sensors not directly exposed via tRPC yet
      };

      siteMap.get(unit.siteId)!.units.push(unitItem);
    }

    // Sort units within each site
    for (const site of siteMap.values()) {
      site.units.sort((a, b) => a.unitName.localeCompare(b.unitName));
    }

    // Convert to array and sort by site name
    return Array.from(siteMap.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [sitesQuery.data, unitsQuery.data]);

  // Summary debug log
  if (DEV) {
    const totalUnits = sites.reduce((sum, s) => sum + s.units.length, 0);
    console.log('[useNavTree] Summary:', {
      organizationId,
      sitesCount: sites.length,
      totalUnits,
      isLoading: sitesQuery.isLoading || unitsQuery.isLoading,
    });

    // Explicit warning when units are empty but sites exist
    if (sitesQuery.data?.length > 0 && unitsQuery.data?.length === 0 && !unitsQuery.isLoading) {
      console.warn('[useNavTree] ⚠️ Sites exist but no units returned - check API or org scoping');
    }
  }

  // Combine errors for better diagnostics
  const combinedError = sitesQuery.error || unitsQuery.error;

  return {
    sites,
    hasSingleSite: sites.length === 1,
    isLoading: sitesQuery.isLoading || unitsQuery.isLoading,
    error: combinedError as Error | null,
  };
}
