# Plan 27-01: TTN Backend Foundation Verification

## Tasks

### 1. Create TTN Service Directory

- [x] `backend/src/services/ttn/types.ts` created
- [x] Defines `TtnConfig`, `PermissionReport`, and other core types

### 2. Implement TTN Base & Client

- [x] `backend/src/services/ttn/client.ts` created
- [x] Uses strict `CLUSTER_BASE_URL` ("nam1.cloud.thethings.network")
- [x] Implements `TtnClient` with fetch wrapper

### 3. Implement TTN Permissions Service

- [x] `backend/src/services/ttn/permissions.ts` created
- [x] Ports `validateMainUserApiKey` logic
- [x] Ports permissions constants

## Verdict

Pass. Foundation is in place.
