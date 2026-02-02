---
phase: 28-supabase-removal
verified: 2026-01-25T18:00:00Z
status: gaps_found
score: 1/4 must-haves verified
re_verification:
  previous_status: passed
  previous_score: unknown
  gaps_closed: []
  gaps_remaining: []
  regressions:
    - 'Frontend pages still import/use Supabase placeholder.'
    - 'Supabase edge function invocations remain in frontend.'
gaps:
  - truth: 'Frontend pages fetch data via tRPC (no Supabase client usage).'
    status: failed
    reason: 'Multiple pages/components still call the Supabase placeholder client.'
    artifacts:
      - path: 'src/pages/OrganizationDashboard.tsx'
        issue: 'Uses supabase.from(...) queries for org/sites/units.'
      - path: 'src/components/settings/AlertRulesScopedEditor.tsx'
        issue: 'Loads sites/units via supabase.from(...).'
      - path: 'src/components/admin/SensorSimulatorPanel.tsx'
        issue: 'Uses Supabase placeholder for simulator data flows.'
    missing:
      - 'Replace Supabase queries with tRPC queries/mutations'
      - 'Remove supabase-placeholder imports in pages/components'
  - truth: 'No Supabase client/placeholder imports remain in frontend source.'
    status: failed
    reason: 'Supabase placeholder is still imported across src (49 matches).'
    artifacts:
      - path: 'src/lib/supabase-placeholder.ts'
        issue: 'Placeholder client remains and is actively imported.'
      - path: 'src/pages/Settings.tsx'
        issue: 'Imports supabase placeholder/types.'
    missing:
      - 'Delete supabase-placeholder client after migration'
      - 'Remove supabase imports from src/pages and src/components'
  - truth: 'Supabase edge function calls removed from frontend.'
    status: failed
    reason: 'Frontend still invokes supabase.functions.invoke in multiple components.'
    artifacts:
      - path: 'src/components/settings/TTNCredentialsPanel.tsx'
        issue: 'Uses supabase.functions.invoke for TTN provisioning.'
      - path: 'src/components/admin/EmulatorTTNRoutingCard.tsx'
        issue: 'Invokes manage-ttn-settings via Supabase functions.'
      - path: 'src/components/reports/ComplianceReportCard.tsx'
        issue: 'Invokes export-temperature-logs via Supabase functions.'
    missing:
      - 'Replace edge-function invocations with backend/tRPC endpoints'
      - 'Remove supabase.functions usage from frontend'
---

# Phase 28: Supabase Removal Verification Report

**Phase Goal:** Complete migration of all frontend pages to tRPC and eliminate Supabase dependency.
**Verified:** 2026-01-25T18:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — prior report existed

## Goal Achievement

### Observable Truths

| #   | Truth                                                             | Status     | Evidence                                                                                                                                         |
| --- | ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Frontend pages fetch data via tRPC (no Supabase client usage).    | ✗ FAILED   | `src/pages/OrganizationDashboard.tsx` uses `supabase.from(...)`; `src/components/settings/AlertRulesScopedEditor.tsx` uses `supabase.from(...)`. |
| 2   | Supabase edge function calls removed from frontend.               | ✗ FAILED   | `src/components/settings/TTNCredentialsPanel.tsx` has multiple `supabase.functions.invoke(...)` calls.                                           |
| 3   | No Supabase client/placeholder imports remain in frontend source. | ✗ FAILED   | 49 `supabase-placeholder` imports in `src/` (pages/components/hooks).                                                                            |
| 4   | Supabase package removed from dependencies.                       | ✓ VERIFIED | `package.json` has no `@supabase/supabase-js` dependency.                                                                                        |

**Score:** 1/4 truths verified

### Required Artifacts

| Artifact                                             | Expected                  | Status     | Details                                                   |
| ---------------------------------------------------- | ------------------------- | ---------- | --------------------------------------------------------- |
| `package.json`                                       | No Supabase dependency    | ✓ VERIFIED | No `@supabase/supabase-js` in dependencies.               |
| `src/lib/supabase-placeholder.ts`                    | Removed                   | ✗ STUB     | Placeholder client still exists and is imported.          |
| `src/pages/OrganizationDashboard.tsx`                | tRPC data access          | ✗ FAILED   | Uses `supabase.from(...)` queries for org/site/unit data. |
| `src/components/settings/AlertRulesScopedEditor.tsx` | tRPC data access          | ✗ FAILED   | Loads sites/units via Supabase queries.                   |
| `src/components/settings/TTNCredentialsPanel.tsx`    | Backend/tRPC provisioning | ✗ FAILED   | Uses `supabase.functions.invoke(...)` for provisioning.   |

### Key Link Verification

| From                                                 | To                           | Via             | Status    | Details                                |
| ---------------------------------------------------- | ---------------------------- | --------------- | --------- | -------------------------------------- |
| `src/pages/OrganizationDashboard.tsx`                | tRPC org/site/unit endpoints | `useTRPC` hooks | NOT_WIRED | Direct Supabase queries remain.        |
| `src/components/settings/AlertRulesScopedEditor.tsx` | tRPC sites/units list        | tRPC queries    | NOT_WIRED | Uses `supabase.from("sites"/"units")`. |
| `src/components/settings/TTNCredentialsPanel.tsx`    | Backend TTN provisioning     | tRPC mutation   | NOT_WIRED | Uses `supabase.functions.invoke(...)`. |

### Requirements Coverage

| Requirement                                          | Status | Blocking Issue |
| ---------------------------------------------------- | ------ | -------------- |
| No Phase 28 requirements mapped in `REQUIREMENTS.md` | N/A    | N/A            |

### Anti-Patterns Found

| File                              | Line | Pattern                             | Severity   | Impact                                                |
| --------------------------------- | ---- | ----------------------------------- | ---------- | ----------------------------------------------------- |
| `src/lib/supabase-placeholder.ts` | 4    | Non-functional Supabase placeholder | 🛑 Blocker | Indicates migration incomplete and calls are stubbed. |
| `src/hooks/useTTNOperations.ts`   | 55   | TODO / temporary unavailability     | ⚠️ Warning | Provisioning still disabled post-migration.           |

### Gaps Summary

Supabase has been removed from dependencies, but frontend pages and components still import and use the Supabase placeholder client and edge function invocations. This means significant portions of the UI are not yet migrated to tRPC, and several flows are still stubbed or routed through deprecated Supabase calls.

---

_Verified: 2026-01-25T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
