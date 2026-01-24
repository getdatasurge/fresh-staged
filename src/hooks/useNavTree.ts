import { useQuery } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { qk } from "@/lib/queryKeys";
import { sitesApi, areasApi, unitsApi } from "@/lib/api";

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
  const user = useUser();

  // Debug logging for impersonation context
  DEV && console.log('[useNavTree] Called with organizationId:', organizationId);

  // Fetch all sites for this organization via new API
  const { data: allSites = [], isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: qk.org(organizationId).sites(),
    queryFn: async () => {
      if (!organizationId) return [];
      if (!user) return [];

      DEV && console.log('[useNavTree] Fetching sites for org:', organizationId);

      // Get access token from Stack Auth
      const { accessToken } = await user.getAuthJson();

      const sites = await sitesApi.listSites(organizationId, accessToken);

      DEV && console.log('[useNavTree] Sites fetched:', sites.length, 'sites');

      return sites.map(site => ({ id: site.id, name: site.name }));
    },
    enabled: !!organizationId && !!user,
    staleTime: 1000 * 30,
  });

  // Fetch all areas and units via new API
  const { data: unitsData = [], isLoading: unitsLoading, error: unitsError } = useQuery({
    queryKey: [...qk.org(organizationId).navTree(), 'units'],
    queryFn: async () => {
      if (!organizationId || allSites.length === 0) return [];
      if (!user) return [];

      DEV && console.log('[useNavTree] Fetching units hierarchy', { effectiveOrgId: organizationId });

      // Get access token from Stack Auth
      const { accessToken } = await user.getAuthJson();

      // Fetch areas for each site, then units for each area
      const allUnits: UnitNavItem[] = [];

      for (const site of allSites) {
        const areas = await areasApi.listAreas(organizationId, site.id, accessToken);

        for (const area of areas) {
          const units = await unitsApi.listUnits(
            organizationId,
            site.id,
            area.id,
            accessToken
          );

          for (const unit of units) {
            allUnits.push({
              unitId: unit.id,
              unitName: unit.name,
              unitType: unit.unitType,
              status: unit.status,
              areaId: area.id,
              areaName: area.name,
              siteId: site.id,
              siteName: site.name,
              layouts: [], // Will be populated from layouts query
              sensorCount: 0, // Will be populated from sensors query
            });
          }
        }
      }

      DEV && console.log('[useNavTree] Units fetched:', allUnits.length, 'units');

      return allUnits;
    },
    enabled: !!organizationId && allSites.length > 0 && !!user,
    staleTime: 1000 * 30,
  });

  // Fetch sensor counts per unit
  const { data: sensors = [], isLoading: sensorsLoading } = useQuery({
    queryKey: [...qk.org(organizationId).navTree(), 'sensors'],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("lora_sensors")
        .select("id, unit_id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .not("unit_id", "is", null);

      if (error) throw error;
      return data as RawSensor[];
    },
    enabled: !!organizationId,
    staleTime: 1000 * 30,
  });

  // Fetch ALL org layouts for all entities (org-wide sharing)
  const { data: layouts = [], isLoading: layoutsLoading } = useQuery({
    queryKey: [...qk.org(organizationId).navTree(), 'layouts'],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from("entity_dashboard_layouts")
        .select("id, entity_type, entity_id, slot_number, name, is_user_default")
        .eq("organization_id", organizationId)
        .order("slot_number", { ascending: true });

      if (error) throw error;
      return data as RawLayout[];
    },
    enabled: !!organizationId,
    staleTime: 1000 * 30,
  });

  // Build navigation tree
  const sites = useMemo(() => {
    // Group units by site
    const siteMap = new Map<string, SiteNavItem>();

    // Create sensor count map
    const sensorCountMap = new Map<string, number>();
    for (const sensor of sensors) {
      if (sensor.unit_id) {
        sensorCountMap.set(sensor.unit_id, (sensorCountMap.get(sensor.unit_id) || 0) + 1);
      }
    }

    // Group layouts by entity
    const unitLayoutsMap = new Map<string, RawLayout[]>();
    const siteLayoutsMap = new Map<string, RawLayout[]>();

    for (const layout of layouts) {
      if (layout.entity_type === 'unit') {
        const existing = unitLayoutsMap.get(layout.entity_id) || [];
        existing.push(layout);
        unitLayoutsMap.set(layout.entity_id, existing);
      } else if (layout.entity_type === 'site') {
        const existing = siteLayoutsMap.get(layout.entity_id) || [];
        existing.push(layout);
        siteLayoutsMap.set(layout.entity_id, existing);
      }
    }

    // First, add all sites (even those without units)
    for (const site of allSites) {
      if (!siteMap.has(site.id)) {
        siteMap.set(site.id, {
          siteId: site.id,
          siteName: site.name,
          layouts: mapLayoutsToSlots(siteLayoutsMap.get(site.id) || []),
          units: [],
        });
      }
    }

    // Add units to their sites
    for (const unit of unitsData) {
      if (!siteMap.has(unit.siteId)) {
        siteMap.set(unit.siteId, {
          siteId: unit.siteId,
          siteName: unit.siteName,
          layouts: mapLayoutsToSlots(siteLayoutsMap.get(unit.siteId) || []),
          units: [],
        });
      }

      const unitItem: UnitNavItem = {
        ...unit,
        layouts: mapLayoutsToSlots(unitLayoutsMap.get(unit.unitId) || []),
        sensorCount: sensorCountMap.get(unit.unitId) || 0,
      };

      siteMap.get(unit.siteId)!.units.push(unitItem);
    }

    // Sort units within each site
    for (const site of siteMap.values()) {
      site.units.sort((a, b) => a.unitName.localeCompare(b.unitName));
    }

    // Convert to array and sort by site name
    return Array.from(siteMap.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [allSites, unitsData, sensors, layouts]);

  // Summary debug log
  if (DEV) {
    const totalUnits = sites.reduce((sum, s) => sum + s.units.length, 0);
    console.log('[useNavTree] Summary:', {
      organizationId,
      sitesCount: sites.length,
      totalUnits,
      isLoading: unitsLoading || sensorsLoading || layoutsLoading || sitesLoading,
    });

    // Explicit warning when units are empty but sites exist
    if (allSites.length > 0 && unitsData.length === 0 && !unitsLoading) {
      console.warn('[useNavTree] ⚠️ Sites exist but no units returned - check API or org scoping');
    }
  }

  // Combine errors for better diagnostics
  const combinedError = sitesError || unitsError;

  return {
    sites,
    hasSingleSite: sites.length === 1,
    isLoading: unitsLoading || sensorsLoading || layoutsLoading || sitesLoading,
    error: combinedError as Error | null,
  };
}
