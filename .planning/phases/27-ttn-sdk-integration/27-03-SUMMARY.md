# Plan 27-03: TTN Settings & Webhook Services Verification

## Tasks

### 1. Implement Settings Service
- [x] `backend/src/services/ttn/settings.ts` created
- [x] `getSettings` retrieves config from Drizzle
- [x] `testConnection` performs HTTP check against TTN API

### 2. Implement Webhook Service
- [x] `backend/src/services/ttn/webhook.ts` created
- [x] `ensureWebhook` handles creation/idempotent updates
- [x] Uses env `API_BASE_URL` for constructing webhook target

## Verdict
Pass.
