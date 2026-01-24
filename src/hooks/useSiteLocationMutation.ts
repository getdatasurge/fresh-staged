/**
 * Site Location Mutation Hook
 *
 * React Query mutation for updating site latitude, longitude, and timezone.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { sitesApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { useOrgScope } from "./useOrgScope";
import { toast } from "sonner";

interface SiteLocationData {
  latitude: number;
  longitude: number;
  timezone: string;
}

export function useSiteLocationMutation(siteId: string) {
  const { orgId } = useOrgScope();
  const user = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SiteLocationData) => {
      if (!orgId || !user) throw new Error('Not authenticated');
      const { accessToken } = await user.getAuthJson();

      // Convert numbers to strings for API
      return sitesApi.updateSite(
        orgId,
        siteId,
        {
          latitude: data.latitude.toString(),
          longitude: data.longitude.toString(),
          timezone: data.timezone,
        },
        accessToken
      );
    },
    onSuccess: () => {
      // Invalidate site queries to refresh site data (so components receive new lat/lon)
      queryClient.invalidateQueries({ queryKey: qk.site(siteId).details() });
      queryClient.invalidateQueries({ queryKey: qk.org(orgId).sites() });
      // Invalidate ALL weather queries - the hook uses ["weather", "current", lat, lon, tz]
      // By invalidating the prefix, we catch all weather queries regardless of coordinates
      queryClient.invalidateQueries({ queryKey: ["weather"] });
      toast.success("Site location updated successfully");
    },
    onError: (error) => {
      console.error("Failed to update site location:", error);
      toast.error("Failed to update site location");
    },
  });
}
