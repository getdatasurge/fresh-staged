import { useQuery } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity";
import { organizationsApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";

export interface OrgBranding {
  name: string;
  logoUrl: string | null;
  accentColor: string;
}

const DEFAULT_ACCENT = "#0097a7";

/**
 * Hook to fetch organization branding settings
 * Uses effectiveOrgId to support impersonation
 */
export function useBranding() {
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();
  const user = useUser();

  const { data: branding, isLoading: loading } = useQuery({
    queryKey: qk.org(effectiveOrgId).branding(),
    queryFn: async () => {
      if (!effectiveOrgId) return null;
      if (!user) return null;

      // Get access token from Stack Auth
      const { accessToken } = await user.getAuthJson();

      // Fetch organization via new API
      const org = await organizationsApi.getOrganization(effectiveOrgId, accessToken);

      const brandingData: OrgBranding = {
        name: org.name,
        logoUrl: org.logoUrl ?? null,
        accentColor: org.accentColor || DEFAULT_ACCENT,
      };

      // Apply accent color as CSS variable if different from default
      if (org.accentColor && org.accentColor !== DEFAULT_ACCENT) {
        applyAccentColor(org.accentColor);
      }

      return brandingData;
    },
    enabled: isInitialized && !!effectiveOrgId && !!user,
    staleTime: 1000 * 60 * 5, // 5 min cache for branding
  });

  return { branding, loading };
}

/**
 * Convert hex color to HSL values for CSS variable
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Apply accent color to CSS variables
 */
function applyAccentColor(hexColor: string) {
  const hsl = hexToHSL(hexColor);
  if (!hsl) return;

  const root = document.documentElement;
  const hslValue = `${hsl.h} ${hsl.s}% ${hsl.l}%`;

  root.style.setProperty("--accent", hslValue);
  root.style.setProperty("--ring", hslValue);
  root.style.setProperty("--sidebar-primary", hslValue);
  root.style.setProperty("--chart-1", hslValue);
}
