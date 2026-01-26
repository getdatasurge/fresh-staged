---
phase: 27
verified: 2026-01-25T14:40:00Z
status: passed
---

# Phase 27: TTN SDK Integration

**Goal:** Eliminate Supabase Edge Functions for TTN integration by porting logic to Backend Services.

## Verification Checklist

### Must-Haves
- [x] Connect Settings (Read) works via tRPC (Ported logic, no mock)
- [x] Connection Test works via tRPC (Ports real HTTP logic)
- [x] API Key Validation works via tRPC (Checks keys, permissions)
- [x] Webhook updates work via tRPC (Updates TTN)
- [x] No `supabase.functions.invoke` calls left in targeted hooks

### Evidence
- All hooks migrated to `trpc.ttnSettings.*` procedures.
- Backend services implement robust HTTP client handling.
- `ttnConfig.ts` and `ttnPermissions.ts` logic preserved in `backend/src/services/ttn/`.

## Verdict
**PASS**. The backend now owns the entire TTN integration lifecycle.