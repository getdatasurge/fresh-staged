# Phase 08: HACCP Compliance Reports & Audit Trail Hardening

FrostGuard serves regulated food service and healthcare organizations where HACCP compliance is non-negotiable. Health inspectors and auditors review temperature logs, corrective actions, and alert histories — every record must be immutable, explainable, and exportable. The current system has basic audit logging and report export, but needs hardening: ensuring compliance data is truly append-only, corrective actions are fully traceable, and export reports meet the format requirements that inspectors expect. This phase strengthens the compliance backbone of the system so that every temperature excursion and corrective action is defensible under audit.

## Tasks

- [ ] Audit the existing event log and audit trail implementation:
  - Read `backend/src/db/schema/audit.ts` to understand the audit table structure
  - Read `backend/src/routers/audit.ts` to understand the audit logging procedures
  - Read `backend/src/services/` for any audit-related service files
  - Verify that the following events are logged:
    - Alert created (with unit, temperature, threshold that was breached)
    - Alert acknowledged (with user who acknowledged, timestamp)
    - Alert resolved (with user, corrective action text, timestamp)
    - Temperature reading ingested (at minimum, batch metadata — not every individual reading)
    - Organization/site/area/unit created, updated, or deleted
    - User role changes
    - Alert rule changes (threshold modifications)
  - If any critical events are NOT being logged, add the audit log calls
  - Verify audit records are append-only (no UPDATE or DELETE operations on the audit table)

- [ ] Implement or verify corrective action tracking on alert resolution:
  - Read `backend/src/db/schema/alerts.ts` for the `correctiveActions` table
  - Read `backend/src/services/alert.service.ts` for the resolve procedure
  - Verify that when an alert is resolved:
    - A corrective action record is required (or at minimum, strongly encouraged)
    - The corrective action includes: description, action taken, user who performed it, timestamp
    - The corrective action is linked to the specific alert
    - The corrective action cannot be edited after creation (append-only for compliance)
  - If corrective actions are optional, make them required on the `alert.resolve` tRPC procedure
  - If corrective actions can be modified after creation, add immutability enforcement (reject UPDATE operations)

- [ ] Build a HACCP-compliant temperature log export endpoint:
  - Read `backend/src/routers/reports.router.ts` for the existing export procedure
  - Verify the export includes all required HACCP fields:
    - Unit name and location (site/area path)
    - Temperature reading value and unit (°C or °F)
    - Timestamp of reading (with timezone)
    - Source: sensor (automatic) or manual log
    - Alert status at time of reading (normal/warning/critical)
    - Corrective action taken (if any excursion occurred)
    - Equipment calibration status
  - Export formats to support:
    - CSV (for spreadsheet import by inspectors)
    - PDF (for formal compliance submission) — if PDF generation is not feasible, CSV is sufficient
  - Filter parameters: date range, site, area, unit
  - Ensure the export header includes organization name, report generation timestamp, and date range

- [ ] Verify immutability constraints on compliance-critical data:
  - Check that `sensor_readings` table does not allow UPDATE or DELETE at the application level
  - Check that `alerts` status transitions are enforced (no jumping from resolved back to active)
  - Check that `corrective_actions` table does not allow UPDATE or DELETE
  - Check that `audit` / `event_logs` table does not allow UPDATE or DELETE
  - If any of these tables allow mutation, add application-level guards in the service layer
  - Consider adding a database trigger or policy that prevents DELETE on compliance tables (optional, defense-in-depth)

- [ ] Write compliance-focused tests:
  - Test file: `backend/tests/compliance/haccp-compliance.test.ts`
  - Test cases:
    - Temperature readings cannot be deleted via any API endpoint
    - Alert audit trail preserves complete state transition history
    - Corrective actions are immutable after creation
    - Export report includes all HACCP-required fields
    - Export with date range filter returns correct data subset
    - Export with no data in range returns empty report (not an error)
    - Audit log entries cannot be modified or deleted
  - Run tests and verify all pass

- [ ] Produce a HACCP compliance readiness report:
  - Create `docs/reports/haccp-compliance-readiness.md` with YAML front matter:
    - type: report, title: HACCP Compliance Readiness, tags: [haccp, compliance, audit, food-safety]
    - related: ["[[Go-Live-Readiness]]", "[[System-Health-Baseline]]"]
  - Document:
    - All compliance events that are logged (with examples)
    - Immutability enforcement summary (which tables, what mechanisms)
    - Export report format and fields
    - Corrective action workflow (required vs optional, immutability status)
    - Gaps or limitations (if any — e.g., no PDF export, limited audit detail)
    - Recommendations for future compliance improvements
