# Plan 27-05: Frontend Hook Migration Verification

## Tasks

### 1. Migrate useTTNSettings

- [x] `src/hooks/useTTNSettings.ts` updated
- [x] Uses `trpc.ttnSettings.get`, `.update`, `.test`
- [x] Removed `manage-ttn-settings` invoke calls

### 2. Migrate useTTNApiKey

- [x] `src/hooks/useTTNApiKey.ts` updated
- [x] Uses `trpc.ttnSettings.validateApiKey`, `.saveAndConfigure`
- [x] Removed `ttn-bootstrap` invoke calls

### 3. Migrate useTTNWebhook

- [x] `src/hooks/useTTNWebhook.ts` updated
- [x] Uses `trpc.ttnSettings.updateWebhook`
- [x] Removed `update-ttn-webhook` invoke calls

### 4. Migrate useTTNSetupWizard

- [x] `src/hooks/useTTNSetupWizard.ts` updated
- [x] Uses integrated queries/mutations for step management

## Verdict

Pass. All frontend hooks now point to the backend services.
