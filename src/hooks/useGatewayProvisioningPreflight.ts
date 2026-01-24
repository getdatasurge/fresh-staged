/**
 * TODO: Full migration to new backend
 * - Replace edge function with backend validation endpoint
 *
 * Current status: Stack Auth for identity, edge functions for validation (Phase 5)
 */
import { useState, useCallback, useEffect } from "react";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY
import { useOrgScope } from "./useOrgScope";

export interface PreflightError {
  code: "WRONG_KEY_TYPE" | "MISSING_GATEWAY_RIGHTS" | "API_KEY_INVALID" | "TTN_NOT_CONFIGURED";
  message: string;
  hint: string;
  fix_steps: string[];
}

export interface PreflightResult {
  ok: boolean;
  request_id: string;
  allowed: boolean;
  key_type: "personal" | "organization" | "application" | "unknown";
  owner_scope: "user" | "organization" | null;
  scope_id: string | null;
  has_gateway_rights: boolean;
  missing_rights: string[];
  error?: PreflightError;
}

export interface UseGatewayProvisioningPreflightReturn {
  status: "idle" | "checking" | "ready" | "blocked" | "error";
  result: PreflightResult | null;
  keyType: "personal" | "organization" | "application" | "unknown" | null;
  ownerScope: "user" | "organization" | null;
  hasGatewayRights: boolean;
  missingRights: string[];
  error: PreflightError | null;
  runPreflight: () => Promise<PreflightResult | null>;
  isLoading: boolean;
}

/**
 * Hook to check if gateway provisioning is allowed based on TTN API key type and permissions
 */
export function useGatewayProvisioningPreflight(
  organizationId: string | null,
  options: { autoRun?: boolean } = {}
): UseGatewayProvisioningPreflightReturn {
  const { autoRun = false } = options;
  const user = useUser();

  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "blocked" | "error">("idle");
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runPreflight = useCallback(async (): Promise<PreflightResult | null> => {
    if (!organizationId || !user) {
      setStatus("idle");
      return null;
    }

    setStatus("checking");
    setIsLoading(true);

    try {
      const { accessToken } = await user.getAuthJson();

      // TODO Phase 6: Replace with backend validation endpoint
      const { data, error } = await supabase.functions.invoke("ttn-gateway-preflight", {
        body: { organization_id: organizationId },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) {
        console.error("[useGatewayProvisioningPreflight] Invoke error:", error);
        setStatus("error");
        setResult(null);
        return null;
      }

      const preflightResult = data as PreflightResult;
      setResult(preflightResult);

      if (preflightResult.allowed) {
        setStatus("ready");
      } else {
        setStatus("blocked");
      }

      return preflightResult;
    } catch (err) {
      console.error("[useGatewayProvisioningPreflight] Error:", err);
      setStatus("error");
      setResult(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, user]);

  // Auto-run preflight if enabled
  useEffect(() => {
    if (autoRun && organizationId && user && status === "idle") {
      runPreflight();
    }
  }, [autoRun, organizationId, user, status, runPreflight]);

  return {
    status,
    result,
    keyType: result?.key_type ?? null,
    ownerScope: result?.owner_scope ?? null,
    hasGatewayRights: result?.has_gateway_rights ?? false,
    missingRights: result?.missing_rights ?? [],
    error: result?.error ?? null,
    runPreflight,
    isLoading,
  };
}
