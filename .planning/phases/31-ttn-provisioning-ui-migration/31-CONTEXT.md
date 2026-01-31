# Phase 31: TTN Provisioning UI Migration - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire TTN provisioning UI (TTNCredentialsPanel.tsx) to existing Phase 27 tRPC endpoints. Replace 6 edge function calls (`manage-ttn-settings`, `ttn-provision-org`) with tRPC calls (`ttnSettings.get`, `ttnSettings.validateApiKey`, `ttnSettings.saveAndConfigure`, `ttnSettings.test`, etc.). Backend endpoints already exist — this is frontend wiring work.

</domain>

<decisions>
## Implementation Decisions

### Error handling

- Display errors using BOTH toast notifications AND inline errors — toast for general awareness, inline for actionable guidance
- Disable controls proactively for non-admin users AND show permission error if they somehow attempt the action
- Strict data expectations — if data doesn't fit expected shape, fail with meaningful error rather than adapting

### Loading states

- Buttons show BOTH spinner icon AND changed text during operations (e.g., spinner + "Validating...")
- Related inputs disabled during operations — Claude decides based on existing patterns

### Response mapping

- Remove old edge function calls entirely — no commented code or deprecated markers
- Adapt UI to consume tRPC's native response shape where cleaner — minimal-change path preferred
- Claude evaluates whether to surface extra data tRPC provides on case-by-case basis

### Testing approach

- Add integration tests with full coverage (happy path, error cases, edge cases like partial data, timeouts)
- Both mock tests (fast feedback) AND integration tests against real backend (confidence)
- Test location follows existing patterns in codebase

### Claude's Discretion

- Retry behavior for transient failures (auto-retry vs manual)
- Visual distinction between validation errors vs server errors
- Initial load indicator (skeleton vs spinner)
- Progress feedback granularity for long operations
- Form locking scope during operations

</decisions>

<specifics>
## Specific Ideas

- Edge function to tRPC mapping is straightforward: `manage-ttn-settings` → `ttnSettings.get/update`, `ttn-provision-org` → `ttnSettings.validateApiKey/saveAndConfigure/updateWebhook/regenerateWebhookSecret`
- UI patterns should match existing settings panels in the codebase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 31-ttn-provisioning-ui-migration_
_Context gathered: 2026-01-28_
