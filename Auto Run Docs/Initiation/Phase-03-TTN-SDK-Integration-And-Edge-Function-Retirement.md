# Phase 03: TTN SDK Integration & Edge Function Retirement

Six frontend hooks remain blocked on Supabase edge functions because they require direct communication with The Things Network (TTN) API for device provisioning, gateway management, and API key validation. These hooks — `useGatewayProvisioningPreflight`, `useTTNSetupWizard`, `useTTNDeprovision`, `useCheckTtnProvisioningState`, `useTTNOperations`, and related TTN hooks — currently call Deno edge functions that use the TTN HTTP API directly. This phase integrates the TTN SDK (or HTTP client) into the Fastify backend, creates tRPC procedures for all TTN operations, migrates the blocked frontend hooks, and documents which legacy edge functions are now superseded.

## Tasks

- [x] Research and install TTN API client for the Fastify backend:
  - Read `supabase/functions/ttn-provision-device/index.ts` and `supabase/functions/ttn-provision-gateway/index.ts` to understand the current TTN API usage patterns
  - Read `supabase/functions/ttn-gateway-preflight/index.ts` for API key validation logic
  - Read `supabase/functions/ttn-manage-application/index.ts` for application management
  - Evaluate options: `@ttn-lw/grpc-web-api-client` npm package OR direct HTTP client to TTN API v3
  - Install the chosen TTN client in `backend/package.json`
  - Create `backend/src/services/ttn-api.service.ts` as a central TTN API client wrapper:
    - Initialize with API key from org's TTN connection settings
    - Methods: `listDevices()`, `provisionDevice()`, `deprovisionDevice()`, `listGateways()`, `registerGateway()`, `deregisterGateway()`, `validateApiKey()`, `getApplicationInfo()`
    - Error handling: map TTN API errors to FrostGuard error types
    - Rate limiting awareness (TTN enforces rate limits)

  > **Completed:** Evaluated TTN client options — chose direct HTTP client via native `fetch()` (no TTN npm SDK needed). The existing `backend/src/services/ttn.service.ts` already served as the central TTN API client wrapper with `listDevices()`, `provisionDevice()`, `deprovisionDevice()`, `listGateways()`, `registerGateway()`, `deregisterGateway()`, `getGatewayStatus()`. Added two missing methods: `validateApiKey()` (replicates ttn-gateway-preflight edge function logic using TTN's auth_info endpoint to detect key type and gateway rights) and `getApplicationInfo()` (verifies TTN application exists and API key has access). Also added supporting types (`TTNAuthInfo`, `TTNApiKeyValidation`, `TTNApplicationInfo`). Error handling already maps to `TTNApiError` with status codes. Added 11 new tests (35 total, all passing).

- [ ] Create backend tRPC procedures for TTN device provisioning workflow:
  - Read the existing `backend/src/routers/ttn-devices.router.ts` — it likely has stub procedures
  - Implement or complete the following tRPC procedures using the new TTN API service:
    - `ttnDevices.provision` — Register a device with TTN and link to a unit
    - `ttnDevices.deprovision` — Remove a device from TTN and unlink
    - `ttnDevices.bootstrap` — Initial device setup (EUI assignment, keys)
    - `ttnDevices.checkProvisioningState` — Query TTN for current device status
  - Each procedure must:
    - Validate user has admin/manager role
    - Use org's TTN connection credentials from the database
    - Log the operation to audit trail
    - Handle TTN API errors gracefully (network timeout, invalid credentials, device already exists)

- [ ] Create backend tRPC procedures for TTN gateway management:
  - Read the existing `backend/src/routers/ttn-gateways.router.ts`
  - Implement or complete:
    - `ttnGateways.register` — Register gateway with TTN
    - `ttnGateways.deregister` — Remove gateway from TTN
    - `ttnGateways.refreshStatus` — Query TTN for gateway connectivity status
    - `ttnGateways.validateGatewayRights` — Check if API key has gateway provisioning permissions (replaces `ttn-gateway-preflight` edge function)
  - Wire the TTN API service into each procedure

- [ ] Migrate blocked frontend hooks to use tRPC procedures:
  - Migrate `src/hooks/useGatewayProvisioningPreflight.ts`:
    - Replace edge function call with `trpc.ttnGateways.validateGatewayRights.useQuery()`
    - Remove the BLOCKED status comment header
  - Migrate `src/hooks/useCheckTtnProvisioningState.ts`:
    - Replace edge function call with `trpc.ttnDevices.checkProvisioningState.useQuery()`
  - Migrate `src/hooks/useTTNSetupWizard.ts`:
    - Replace edge function calls with tRPC mutations for provisioning steps
  - Migrate `src/hooks/useTTNDeprovision.ts`:
    - Replace edge function call with `trpc.ttnDevices.deprovision.useMutation()`
  - Migrate any remaining `useTTNOperations.ts` edge function calls
  - For each hook: verify TypeScript compilation passes after migration

- [ ] Create a deprecation inventory of all legacy Supabase edge functions:
  - Read each edge function in `supabase/functions/` directory
  - Create `docs/reports/edge-function-deprecation-inventory.md` with YAML front matter:
    - type: report, title: Edge Function Deprecation Inventory, tags: [migration, supabase, deprecation, ttn]
  - For each of the 39 edge functions, document:
    - Function name
    - Purpose (one line)
    - Status: `REPLACED` (backend equivalent exists), `REDUNDANT` (no longer needed), or `ACTIVE` (still required)
    - Backend replacement: path to the Fastify route/tRPC procedure that replaces it
  - Categorize counts: how many replaced, how many redundant, how many still active
  - This inventory is the roadmap for eventual `supabase/functions/` directory removal

- [ ] Write integration tests for the TTN provisioning workflow:
  - Test file: `backend/tests/services/ttn-api.test.ts`
  - Mock the TTN HTTP API responses (do NOT call real TTN in tests)
  - Test cases:
    - Device provisioning succeeds with valid credentials and EUI
    - Device provisioning fails gracefully when TTN returns 409 (already exists)
    - Device deprovisioning removes the device and cleans up local records
    - Gateway registration with valid API key succeeds
    - API key validation correctly identifies key type (personal vs app key)
    - Network timeout handling (TTN unreachable)
  - Run all tests and verify they pass
