# Phase 04: Real-Time Dashboard Completion

The Socket.io server infrastructure was built in Phase 14 (v2.0) with Redis adapter, JWT authentication, and organization-based room isolation. The frontend has a `RealtimeProvider` component with hooks for sensor data, alerts, and unit state — but the integration between backend event emitters and frontend consumers hasn't been fully verified end-to-end. This phase completes the real-time loop: ensuring the backend emits events when readings arrive and alerts fire, the frontend receives and displays them without page refresh, and the connection status UI accurately reflects Socket.io state. The result is a live-updating dashboard that operators can trust.

## Tasks

- [ ] Audit the backend Socket.io event emission points and verify they fire correctly:
  - Read `backend/src/plugins/socket.plugin.ts` to understand the Socket.io server configuration
  - Read `backend/src/services/readings.service.ts` — verify that after a reading is stored, a `sensor:reading` event is emitted to the correct organization room
  - Read `backend/src/services/alert.service.ts` — verify that when an alert is created, `alert:triggered` is emitted; when acknowledged, `alert:acknowledged`; when resolved, `alert:resolved`
  - Read `backend/src/workers/alert-processor.ts` — verify the worker emits events after processing
  - If event emission is missing or incomplete, add it at the correct points:
    - After successful reading insertion → emit `sensor:reading` with `{ unitId, temperature, recordedAt, deviceId }`
    - After alert state change → emit `alert:stateChange` with `{ alertId, unitId, newStatus, previousStatus }`
    - After unit state update → emit `unit:stateChange` with `{ unitId, newState, temperature }`
  - All events must be scoped to the organization room (e.g., `io.to(\`org:${orgId}\`).emit(...)`)

- [ ] Verify and complete the frontend real-time hooks:
  - Read `src/hooks/useRealtimeSensorData.ts` — verify it listens for `sensor:reading` and updates TanStack Query cache
  - Read `src/hooks/useRealtimeAlerts.ts` — verify it listens for alert events and invalidates/updates query cache
  - Read `src/hooks/useRealtimeUnitState.ts` — verify it listens for unit state changes
  - Read `src/hooks/useRealtimeConnection.ts` — verify connection state management
  - For each hook, ensure:
    - Socket event listener is registered on mount and cleaned up on unmount
    - TanStack Query cache is updated optimistically or invalidated on event receipt
    - Organization room subscription happens when org context is available
  - If any hook is incomplete or stubbed, implement the missing logic
  - Read `src/lib/socket.ts` to verify the client connection configuration (URL, auth token, reconnection)

- [ ] Implement connection status UI indicators on the dashboard:
  - Read `src/providers/RealtimeProvider.tsx` — it exposes `isConnected`, `isConnecting`, `connectionError`
  - Read the dashboard page (`src/pages/Dashboard.tsx`) to understand the current layout
  - Add a connection status indicator (green dot = connected, yellow = connecting, red = disconnected) to the dashboard header or sidebar
  - When disconnected, show a non-intrusive banner: "Live updates paused — reconnecting..."
  - When reconnected after a disconnect, briefly show "Live updates resumed" and trigger a data refresh
  - Ensure the status indicator is accessible (screen reader text, not just color-coded)

- [ ] Create a real-time integration test using the sensor simulator:
  - Read `supabase/functions/sensor-simulator/index.ts` to understand the existing simulator
  - Create a test scenario in `backend/tests/integration/realtime-pipeline.test.ts`:
    - Establish a Socket.io client connection with a test JWT
    - Join an organization room
    - Submit a reading via the REST ingestion endpoint (`POST /api/ingest/readings` or tRPC)
    - Verify the Socket.io client receives the `sensor:reading` event within 5 seconds
    - Submit a reading that violates alert thresholds
    - Verify the `alert:triggered` event is received
  - If a full integration test is too complex, create a manual verification script:
    - `scripts/test/verify-realtime.sh` that uses `curl` + `wscat` (or similar) to test the pipeline
  - Document the test results

- [ ] Verify the dashboard updates in real-time without manual refresh:
  - With the full stack running (docker, backend, frontend):
    - Open the dashboard in a browser
    - Use curl or the sensor simulator to submit a new reading
    - Verify the reading appears on the dashboard unit card without page refresh
    - Submit a reading that breaches a threshold
    - Verify the unit card status changes to warning/critical without page refresh
    - Verify the alert count updates in the navigation or alert badge
  - If real-time updates are not reflected, trace the issue:
    - Check backend logs for Socket.io emission
    - Check browser DevTools Network/WS tab for incoming events
    - Check React DevTools for TanStack Query cache updates
  - Fix any issues found in the event chain
  - Document the verification results in `docs/reports/realtime-verification.md` with YAML front matter:
    - type: report, title: Real-Time Pipeline Verification, tags: [realtime, socket-io, verification]
