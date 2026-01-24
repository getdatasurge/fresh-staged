---
phase: 01-local-development-environment
plan: 03
subsystem: database
tags: [drizzle-orm, postgresql, time-series, device-management, telemetry]

# Dependency graph
requires:
  - phase: 01-02
    provides: Foundation schemas (enums, hierarchy, users)
provides:
  - Device management tables (devices, loraSensors, calibrationRecords, pairingSessions)
  - Time-series telemetry tables (sensorReadings, manualTemperatureLogs, doorEvents)
  - Composite time-series indexes for query performance
affects: [01-04-alerting-schemas, 01-05-complete-schema, 02-backend-api, 03-sensor-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Time-series indexing pattern: composite (unit_id, timestamp) indexes"
    - "Numeric precision pattern: numeric(7,2) for temperature/humidity"
    - "Device lifecycle pattern: pairing sessions, calibration records"

key-files:
  created:
    - backend/src/db/schema/devices.ts
    - backend/src/db/schema/telemetry.ts
  modified: []

key-decisions:
  - "Use numeric(7,2) for temperature instead of integers for database-level precision"
  - "Composite indexes on (unitId, timestamp) for time-series query optimization"
  - "Separate recordedAt and receivedAt timestamps for data integrity"
  - "Include rawPayload field for debugging and audit trail"

patterns-established:
  - "Time-series indexing: Primary composite index on (entity_id, timestamp) for all time-series tables"
  - "Device lifecycle tracking: Pairing sessions for temporary state, calibration records for compliance history"
  - "Dual timestamps: recordedAt (device time) vs receivedAt (server time) for clock drift handling"

# Metrics
duration: 2min
completed: 2026-01-23
---

# Phase 01 Plan 03: Device and Telemetry Schemas Summary

**Device management with LoRaWAN config and time-series telemetry tables with composite indexes for high-volume sensor data**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-23T14:45:14Z
- **Completed:** 2026-01-23T14:47:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 4 device management tables covering hardware lifecycle from pairing to calibration
- 3 time-series telemetry tables optimized for high-volume temperature data queries
- Composite indexes on (unitId, timestamp) for fast time-series queries
- Full LoRaWAN sensor configuration support (devEui, appEui, appKey)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create device schemas** - `b355a4a` (feat)
   - devices, loraSensors, calibrationRecords, pairingSessions tables

2. **Task 2: Create telemetry schemas** - `b4d0d2e` (feat)
   - sensorReadings, manualTemperatureLogs, doorEvents tables

## Files Created/Modified

### Created
- `backend/src/db/schema/devices.ts` (170 lines) - Device management tables
  - `devices` - Physical sensor hardware with status tracking
  - `loraSensors` - LoRaWAN-specific configuration (TTN integration)
  - `calibrationRecords` - Compliance calibration history
  - `pairingSessions` - Temporary device pairing workflow state

- `backend/src/db/schema/telemetry.ts` (143 lines) - Time-series data tables
  - `sensorReadings` - High-volume temperature/humidity data with composite time-series index
  - `manualTemperatureLogs` - User-entered readings with profile attribution
  - `doorEvents` - Door sensor state change history

## Decisions Made

1. **Numeric precision for temperatures:** Used `numeric(7,2)` instead of integers (as used in units table with tempMin/tempMax). This provides database-level precision and avoids floating-point comparison issues while maintaining readability in queries.

2. **Composite time-series indexes:** All telemetry tables have `(unitId, timestamp)` composite indexes as their primary query pattern for fetching readings for a specific unit over time.

3. **Dual timestamps:** `recordedAt` (device-reported time) and `receivedAt` (server time) in sensorReadings to handle clock drift and network delays.

4. **Raw payload storage:** Included `rawPayload` text field in sensorReadings for debugging and audit trails when investigating data quality issues.

5. **Device EUI uniqueness:** Unique index on `deviceEui` to prevent duplicate device registrations across the system.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

**Ready for Phase 01-04 (Alerting Schemas):**
- Device and telemetry tables complete
- All foreign key relationships established (units, hubs, devices, profiles)
- Time-series indexes in place for alert rule evaluation queries
- Temperature data schema supports both automated (sensorReadings) and manual (manualTemperatureLogs) monitoring

**Blockers:** None

**Notes:**
- Alert rules will query sensorReadings using the composite (unitId, recordedAt) index
- Door events table ready for door-open alert logic
- Calibration expiration tracking ready for calibration-due alerts

---
*Phase: 01-local-development-environment*
*Completed: 2026-01-23*
