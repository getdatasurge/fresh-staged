# Plan 27-02: TTN Bootstrap Service Verification

## Tasks

### 1. Migrate Obfuscation Logic
- [x] `backend/src/services/ttn/crypto.ts` created
- [x] Implements `deobfuscateKey` (legacy + v2 + b64)
- [x] Implements `obfuscateKey`

### 2. Implement Provisioning Service
- [x] `backend/src/services/ttn/provisioning.ts` created
- [x] `validateConfiguration` handles key checks and permission analysis
- [x] `provisionOrganization` handles DB upsert and delegates webhook setup

## Verdict
Pass.
