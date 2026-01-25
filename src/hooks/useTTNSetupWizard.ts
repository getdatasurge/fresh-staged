/**
 * TTN Setup Wizard Hooks
 *
 * Status: BLOCKED - Requires backend implementation
 *
 * Current implementation:
 * - Uses manage-ttn-settings edge function for wizard state management
 * - Edge function handles: get settings, update region, save API key, test connection
 *
 * Migration blockers:
 * - Depends on useTTNApiKey migration (API key validation)
 * - Depends on useTTNSettings migration (settings CRUD) - DONE in Plan 21-06
 * - Depends on backend TTN connection testing
 *
 * Edge functions used:
 * - manage-ttn-settings (get, update, test actions)
 *
 * Migration path:
 * 1. Partially migrate to use ttnSettings.get from Plan 21-06 (DONE)
 * 2. Use ttnSettings.update for region/enabled toggle (DONE)
 * 3. Wait for API key validation backend implementation
 * 4. Migrate remaining wizard steps to tRPC
 *
 * Estimated effort: Small (mostly uses already-migrated procedures)
 * Priority: High (blocks wizard UX improvements)
 */

import { useState, useCallback } from "react";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY
import { TTN_WIZARD_STEPS, type TTNRegion } from "@/lib/ttnErrorConfig";
import { useOrgScope } from "./useOrgScope";

export interface TTNWizardState {
  currentStep: number;
  steps: {
    id: string;
    isComplete: boolean;
    error?: string;
  }[];
  region: TTNRegion;
  applicationId: string | null;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  deviceRegistered: boolean;
  webhookConfigured: boolean;
  lastTestResult: TTNTestResult | null;
  isComplete: boolean;
}

export interface TTNTestResult {
  success: boolean;
  error?: string;
  hint?: string;
  applicationName?: string;
  testedAt: string;
  clusterTested: string;
  deviceTest?: {
    deviceId: string;
    exists: boolean;
    error?: string;
  };
}

const INITIAL_STATE: TTNWizardState = {
  currentStep: 0,
  steps: TTN_WIZARD_STEPS.map(step => ({
    id: step.id,
    isComplete: false,
    error: undefined,
  })),
  region: 'eu1',
  applicationId: null,
  hasApiKey: false,
  apiKeyLast4: null,
  deviceRegistered: false,
  webhookConfigured: false,
  lastTestResult: null,
  isComplete: false,
};

export function useTTNSetupWizard(organizationId: string | null) {
  const user = useUser();
  const [state, setState] = useState<TTNWizardState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  /**
   * Load current TTN settings and determine wizard state
   */
  const loadSettings = useCallback(async () => {
    if (!organizationId || !user) return;

    setIsLoading(true);
    try {
      const { accessToken } = await user.getAuthJson();

      // TODO: Replace with tRPC when backend TTN SDK integration is available
      // Requires: ttnSettings procedures for wizard state management
      const { data, error } = await supabase.functions.invoke("manage-ttn-settings", {
        body: { action: "get", organization_id: organizationId },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) throw error;

      const newSteps = [...state.steps];
      
      // Step 0: Cluster - always completable
      if (data.ttn_region) {
        newSteps[0].isComplete = true;
      }
      
      // Step 1: Application - complete if we have global app ID
      if (data.global_application_id) {
        newSteps[1].isComplete = true;
      }
      
      // Step 2: API Key
      if (data.has_api_key) {
        newSteps[2].isComplete = true;
      }

      // Check if last test passed
      const lastTest = data.last_connection_test_result as TTNTestResult | null;
      
      setState(prev => ({
        ...prev,
        region: (data.ttn_region || 'nam1') as TTNRegion,
        applicationId: data.global_application_id || null,
        hasApiKey: data.has_api_key || false,
        apiKeyLast4: data.api_key_last4 || null,
        lastTestResult: lastTest,
        steps: newSteps,
        isComplete: newSteps.every(s => s.isComplete),
      }));
    } catch (err) {
      console.error("[useTTNSetupWizard] Error loading settings:", err);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, user, state.steps]);

  /**
   * Update region setting
   */
  const setRegion = useCallback(async (region: TTNRegion) => {
    if (!organizationId || !user) return;

    setIsLoading(true);
    try {
      const { accessToken } = await user.getAuthJson();

      // TODO Phase 6: Replace with backend API call
      const { error } = await supabase.functions.invoke("manage-ttn-settings", {
        body: {
          action: "update",
          organization_id: organizationId,
          ttn_region: region,
        },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) throw error;

      setState(prev => {
        const newSteps = [...prev.steps];
        newSteps[0].isComplete = true;
        newSteps[0].error = undefined;
        return {
          ...prev,
          region,
          steps: newSteps,
          currentStep: Math.max(prev.currentStep, 1),
        };
      });
    } catch (err) {
      setState(prev => {
        const newSteps = [...prev.steps];
        newSteps[0].error = err instanceof Error ? err.message : "Failed to save region";
        return { ...prev, steps: newSteps };
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, user]);

  /**
   * Test TTN connection
   */
  const testConnection = useCallback(async (sensorId?: string) => {
    if (!organizationId || !user) return null;

    setIsTesting(true);
    try {
      const { accessToken } = await user.getAuthJson();

      // TODO: Replace with tRPC when backend TTN SDK integration is available
      // Requires: ttnSettings procedures for wizard state management
      const { data, error } = await supabase.functions.invoke("manage-ttn-settings", {
        body: {
          action: "test",
          organization_id: organizationId,
          sensor_id: sensorId,
        },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) throw error;

      const result = data as TTNTestResult;
      
      setState(prev => {
        const newSteps = [...prev.steps];
        
        // Update step statuses based on test result
        if (result.success) {
          newSteps[1].isComplete = true; // Application verified
          newSteps[2].isComplete = true; // API key works
          newSteps[1].error = undefined;
          newSteps[2].error = undefined;
          
          if (result.deviceTest?.exists) {
            newSteps[3].isComplete = true; // Device registered
            newSteps[3].error = undefined;
          } else if (result.deviceTest) {
            newSteps[3].error = result.deviceTest.error || "Device not found";
          }
        } else {
          // Determine which step failed
          if (result.error?.includes("Application") || result.error?.includes("not found")) {
            newSteps[1].error = result.error;
          } else if (result.error?.includes("API key") || result.error?.includes("permission")) {
            newSteps[2].error = result.error;
          } else if (result.error?.includes("Device")) {
            newSteps[3].error = result.error;
          }
        }

        return {
          ...prev,
          lastTestResult: result,
          steps: newSteps,
        };
      });

      return result;
    } catch (err) {
      console.error("[useTTNSetupWizard] Test error:", err);
      return null;
    } finally {
      setIsTesting(false);
    }
  }, [organizationId, user]);

  /**
   * Save API key
   */
  const saveApiKey = useCallback(async (apiKey: string) => {
    if (!organizationId || !user) return false;

    setIsLoading(true);
    try {
      const { accessToken } = await user.getAuthJson();

      // TODO Phase 6: Replace with backend API call
      const { error } = await supabase.functions.invoke("manage-ttn-settings", {
        body: {
          action: "update",
          organization_id: organizationId,
          ttn_api_key: apiKey,
        },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) throw error;

      setState(prev => {
        const newSteps = [...prev.steps];
        newSteps[2].isComplete = true;
        newSteps[2].error = undefined;
        return {
          ...prev,
          hasApiKey: true,
          apiKeyLast4: apiKey.slice(-4),
          steps: newSteps,
          currentStep: Math.max(prev.currentStep, 3),
        };
      });

      return true;
    } catch (err) {
      setState(prev => {
        const newSteps = [...prev.steps];
        newSteps[2].error = err instanceof Error ? err.message : "Failed to save API key";
        return { ...prev, steps: newSteps };
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, user]);

  /**
   * Mark a step as complete
   */
  const completeStep = useCallback((stepIndex: number) => {
    setState(prev => {
      const newSteps = [...prev.steps];
      newSteps[stepIndex].isComplete = true;
      newSteps[stepIndex].error = undefined;
      return {
        ...prev,
        steps: newSteps,
        currentStep: Math.max(prev.currentStep, stepIndex + 1),
        isComplete: newSteps.every(s => s.isComplete),
      };
    });
  }, []);

  /**
   * Go to a specific step
   */
  const goToStep = useCallback((stepIndex: number) => {
    setState(prev => ({
      ...prev,
      currentStep: Math.min(stepIndex, TTN_WIZARD_STEPS.length - 1),
    }));
  }, []);

  /**
   * Reset wizard
   */
  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    isLoading,
    isTesting,
    loadSettings,
    setRegion,
    testConnection,
    saveApiKey,
    completeStep,
    goToStep,
    reset,
  };
}
