---
phase: 04
plan: 02
subsystem: alerting
tags: [alert-evaluation, state-machine, threshold-checking, drizzle-orm, business-logic]
requires:
  - phase: 04
    plan: 01
    for: Database schema (alerts, alertRules, units)
provides:
  - Alert state machine evaluation (ok -> excursion -> alarm_active -> restoring)
  - Rule hierarchy resolution (unit -> site -> org precedence)
  - Idempotent alert creation with deduplication
affects:
  - phase: 04
    plan: 03
    how: Readings ingestion will call evaluateUnitAfterReading
  - phase: 04
    plan: 04
    how: Alert routes will use alertEvaluator service
tech-stack:
  added: []
  patterns:
    - 'Service-layer state machine with transaction atomicity'
    - 'Hierarchical configuration resolution (unit > site > org)'
    - 'Status-based idempotency for alert deduplication'
key-files:
  created:
    - backend/src/services/alert-evaluator.service.ts
  modified:
    - backend/src/services/index.ts
decisions:
  - what: State transitions use unit.updatedAt for confirmation timing
    why: Simpler than separate lastStatusChange column; updatedAt tracks last state change
    alternatives: ['Add lastStatusChange column', 'Store state history in separate table']
  - what: Hysteresis fixed at 0.5 degrees (5 integer units)
    why: Prevents oscillation at threshold boundaries; can be made configurable later
    alternatives: ['Store in alertRules', 'Store per-unit']
  - what: Synchronous alert evaluation in transaction
    why: Simpler for MVP; ensures atomic state updates
    alternatives: ['Async job queue with BullMQ', 'Database triggers']
metrics:
  duration: ~3 minutes
  commits: 2
  files_changed: 2
  completed: 2026-01-23
---

# Phase 04 Plan 02: Alert Evaluator Service Summary

**One-liner:** Temperature threshold evaluation with state machine transitions (ok -> excursion -> alarm_active -> restoring) and rule hierarchy resolution

## What Was Built

Created the core alert evaluation service that implements the unit status state machine and temperature threshold checking. This service determines when temperature excursions become alerts, prevents duplicate alerts for ongoing excursions, and manages unit status throughout the alert lifecycle.

### Core Components

1. **Alert Evaluator Service** (`alert-evaluator.service.ts`)
   - `evaluateUnitAfterReading()`: Main state machine evaluation with atomic transactions
   - `resolveEffectiveThresholds()`: Hierarchical threshold resolution (unit -> site -> org)
   - `createAlertIfNotExists()`: Idempotent alert creation with status-based deduplication

2. **State Machine Implementation**

   ```
   ok -> excursion -> alarm_active -> restoring -> ok
        (temp out)  (confirmed)      (temp returns)  (N good readings)
   ```

3. **Rule Hierarchy**
   - Unit-level alert rules (highest precedence)
   - Site-level alert rules (fallback)
   - Org-level alert rules (default fallback)
   - Unit's own tempMin/tempMax as base values

### Key Features

- **Atomic State Transitions**: All unit status updates, alert creation/resolution happen within database transaction
- **Hysteresis Support**: Temperature must return 0.5°F inside thresholds to prevent oscillation
- **Alert Deduplication**: Checks for existing active/acknowledged alerts before creating new ones
- **Confirmation Delays**: Excursion state delays alert escalation (default 10 minutes, configurable via rules)
- **Severity Escalation**: Warning on excursion, critical on alarm_active confirmation

## Technical Implementation

### State Machine Logic

Each state transition is triggered by temperature evaluation:

1. **ok → excursion**: Temperature exceeds tempMin or tempMax
   - Creates warning-level alert immediately
   - Records threshold violated (min/max)

2. **excursion → alarm_active**: Excursion persists beyond confirmation time
   - Escalates existing alert to critical severity
   - Sets escalationLevel = 1

3. **excursion/alarm_active → restoring**: Temperature returns within hysteresis bounds
   - Resolves active alerts
   - Unit ready to return to ok state

### Hierarchy Resolution Algorithm

```typescript
// Priority order (most specific wins):
1. alertRules where unitId = [target unit]
2. alertRules where siteId = [target site] AND unitId IS NULL
3. alertRules where organizationId = [target org] AND siteId IS NULL AND unitId IS NULL
4. Fallback to unit.tempMin/tempMax if no rules exist
```

### Alert Deduplication

Uses status-based idempotency:

```sql
SELECT * FROM alerts
WHERE unit_id = $1
  AND alert_type = $2
  AND status IN ('active', 'acknowledged')
LIMIT 1
```

If found, returns `null` instead of creating duplicate alert.

## Testing Notes

Verification performed:

- ✅ TypeScript compilation clean (`pnpm tsc --noEmit`)
- ✅ State machine transitions documented in code comments
- ✅ Alert deduplication uses `inArray(alerts.status, ['active', 'acknowledged'])`
- ✅ All functions properly exported from services/index.ts

Integration tests should verify:

- Temperature above max triggers excursion → warning alert
- Excursion persisting beyond confirm time escalates to alarm_active → critical
- Concurrent readings don't create duplicate alerts
- Temperature returning to range transitions to restoring and resolves alert
- Hysteresis prevents immediate re-triggering

## Deviations from Plan

### Task Consolidation

**Deviation:** Task 1 and Task 2 were effectively combined in a single implementation.

**Reason:** The plan expected Task 1 to create basic state machine and Task 2 to add hierarchy resolution. However, implementing the state machine correctly required the full hierarchy resolution from the start (threshold values are needed for evaluation). Implementing a "basic" version without hierarchy would have been incomplete and non-functional.

**Impact:**

- Task 1 commit includes complete hierarchy resolution
- Task 2 has no separate commit (functionality already present)
- Total commits: 2 instead of 3 (Task 1, Task 3 only)

**Classification:** Rule 2 (Auto-add missing critical functionality) - Hierarchy resolution is critical for correct threshold evaluation.

## Next Phase Readiness

### Ready to Use

- `services.alertEvaluator.evaluateUnitAfterReading()` ready for readings ingestion (Plan 04-03)
- `services.alertEvaluator.resolveEffectiveThresholds()` available for threshold queries
- Alert deduplication prevents duplicate creation during bulk ingestion

### Integration Points

- **Plan 04-03** (Readings Ingestion): Call `evaluateUnitAfterReading()` after inserting readings
- **Plan 04-04** (Alert Routes): Use service for manual alert operations
- **Future**: Consider adding async job queue for scheduled state evaluation (restoring -> ok transition)

### Known Limitations

1. **Restoring → ok transition**: Currently manual; needs scheduled job to check N consecutive good readings
2. **Door state context**: Not yet implemented (grace periods for door open events)
3. **Caching**: No caching of threshold resolution; may add if performance becomes issue
4. **Alert rule schedules**: Schedule field exists but not evaluated (24/7 alerting only)

## Production Considerations

### Performance

- Threshold resolution queries entire alertRules table per evaluation
- Consider adding index on (organizationId, isEnabled, unitId, siteId) if slow
- Consider caching effective thresholds per unit (invalidate on rule changes)

### Monitoring

- Log state transitions for audit trail
- Alert when threshold configuration missing (misconfiguration)
- Track alert creation rate (high rate may indicate sensor issues)

### Reliability

- Transaction ensures atomic updates (no partial state)
- Status-based deduplication handles concurrent requests
- Hysteresis prevents flapping at boundaries

## Lessons Learned

1. **State machine requires full context**: Cannot implement evaluation without threshold sources
2. **Transaction atomicity is critical**: Unit state, alert creation, alert resolution must be atomic
3. **Hierarchical config is complex**: Three-level fallback (unit > site > org) needs careful testing
4. **Integer temperature math**: Must remember temp is stored as int (320 = 32.0F) for comparisons

## Metadata

**Completed:** 2026-01-23
**Duration:** ~3 minutes
**Commits:** 2 (f40af55, 39633e3)
**Files Changed:** 2 created, 1 modified
**Lines Added:** ~325
