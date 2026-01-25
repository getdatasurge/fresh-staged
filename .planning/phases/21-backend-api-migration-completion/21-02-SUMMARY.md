---
phase: 21-backend-api-migration-completion
plan: 02
subsystem: tRPC-API
tags: [tRPC, TTN, IoT, gateways, devices, middleware]

# Dependency Graph
requires:
  - 21-01 # Foundation routers
provides:
  - ttnGatewaysRouter
  - ttnDevicesRouter
  - sensorCapacityProcedure
affects:
  - 21-03 # May use sensor capacity pattern
  - Frontend TTN management migration

# Tech Tracking
tech-stack:
  added: []
  patterns:
    - sensorCapacityProcedure middleware for subscription limits
    - TTN error handling (TTNConfigError, TTNProvisioningError)

# File Tracking
key-files:
  created:
    - backend/src/routers/ttn-gateways.router.ts
    - backend/src/routers/ttn-devices.router.ts
    - backend/tests/trpc/ttn-gateways.router.test.ts
    - backend/tests/trpc/ttn-devices.router.test.ts
  modified:
    - backend/src/trpc/procedures.ts
    - backend/src/trpc/router.ts

# Decisions
decisions:
  - id: TTN-01
    title: sensorCapacityProcedure replicates REST middleware logic
    rationale: Consistent sensor capacity enforcement across REST and tRPC

# Metrics
metrics:
  duration: 6m
  completed: 2026-01-25
---

# Phase 21 Plan 02: TTN Domain tRPC Routers Summary

**One-liner:** TTN gateway and device tRPC routers with sensor capacity middleware for IoT device provisioning.

## What Was Built

### 1. sensorCapacityProcedure Middleware (`backend/src/trpc/procedures.ts`)
- New procedure extending `orgProcedure` to check subscription sensor limits
- Replicates `requireSensorCapacity` REST middleware logic for tRPC
- Used by device provisioning operations (provision, bootstrap)

### 2. TTN Gateways Router (`backend/src/routers/ttn-gateways.router.ts`)
6 procedures for gateway management:
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `list` | query | org member | List all gateways for organization |
| `get` | query | org member | Get gateway by ID |
| `register` | mutation | manager/admin/owner | Register new gateway in TTN |
| `update` | mutation | manager/admin/owner | Update gateway settings |
| `deregister` | mutation | manager/admin/owner | Remove gateway from TTN |
| `refreshStatus` | mutation | org member | Update gateway status from TTN |

### 3. TTN Devices Router (`backend/src/routers/ttn-devices.router.ts`)
6 procedures for device management:
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `list` | query | org member | List all devices for organization |
| `get` | query | org member | Get device by ID |
| `provision` | mutation | manager+ (capacity) | Provision new device with credentials |
| `bootstrap` | mutation | manager+ (capacity) | Bootstrap device with auto-generated credentials |
| `update` | mutation | manager/admin/owner | Update device settings |
| `deprovision` | mutation | manager/admin/owner | Remove device from TTN |

### 4. Test Coverage
- **23 tests** for ttn-gateways.router.ts
- **28 tests** for ttn-devices.router.ts
- **51 total tests** passing

Coverage includes:
- Happy path for each procedure
- Role-based access (manager/admin/owner vs viewer/staff)
- Sensor capacity enforcement for provision/bootstrap
- Error handling (NOT_FOUND, BAD_REQUEST from service errors)

## Commits

| Hash | Message |
|------|---------|
| 34ad33b | feat(21-02): add sensorCapacityProcedure for device provisioning |
| d3d811d | feat(21-02): add TTN gateways and devices tRPC routers |
| 7d374f1 | test(21-02): add comprehensive tests for TTN routers |

## Technical Patterns

### Sensor Capacity Middleware
```typescript
export const sensorCapacityProcedure = orgProcedure.use(hasSensorCapacity);
```
- Checks `getActiveSensorCount` against org's `sensorLimit`
- Throws FORBIDDEN if capacity exceeded
- Used by `provision` and `bootstrap` procedures

### TTN Error Handling
```typescript
if (error.name === 'TTNConfigError' || error.name === 'TTNProvisioningError') {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: error.message,
  });
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] TypeScript compiles (no TTN-related errors)
- [x] sensorCapacityProcedure exported from procedures.ts
- [x] Both TTN routers registered in appRouter
- [x] All 51 new tests pass
- [x] REST routes unchanged (parallel operation)

## Next Phase Readiness

**Ready for:**
- Plan 21-03: Additional routers (notifications, availability, etc.)
- Frontend migration from REST to tRPC for TTN management

**Notes:**
- Pre-existing TypeScript errors in notification-policy.service.ts are unrelated to this plan
