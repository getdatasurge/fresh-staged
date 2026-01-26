# Remaining Supabase Calls in Specialized Functionality

This document lists all remaining Supabase operations in specialized functionality, including TTN integration, dashboard layout system, health check system, and soft delete functionality. Each file is reviewed to identify if operations should be refactored to tRPC or are temporary, and priority levels are assigned.

---

## 1. TTN Integration Hooks

### File 1: src/hooks/useTTNDeprovision.ts

**File Path**: `src/hooks/useTTNDeprovision.ts`  
**Number of Supabase Calls**: 5  
**Type of Operations**: Query, Mutation, RPC, Edge Function

**Supabase Operations**:

1. `supabase.from("ttn_deprovision_jobs").select("*")` - Query to fetch deprovision jobs
2. `supabase.rpc("get_deprovision_job_stats")` - RPC call to get job statistics
3. `supabase.functions.invoke("ttn-list-devices")` - Edge function to scan for orphaned devices
4. `supabase.from("ttn_deprovision_jobs").insert(jobs)` - Mutation to create deprovision jobs
5. `supabase.from("ttn_deprovision_jobs").update()` - Mutation to retry failed jobs

**Purpose**:

- Manages TTN deprovisioning jobs (list, stats, scan, create, retry)
- Handles orphaned device cleanup in TTN
- Uses edge functions and direct DB access for job management

**Status**: BLOCKED - Requires backend job queue implementation (BullMQ + TTN SDK integration)
**Priority**: Low (infrequent admin operation)
**Notes**: Should be refactored to tRPC once backend job queue is implemented

---

### File 2: src/hooks/useTTNWebhook.ts

**File Path**: `src/hooks/useTTNWebhook.ts`  
**Number of Supabase Calls**: 1  
**Type of Operations**: Edge Function

**Supabase Operations**:

1. `supabase.functions.invoke("ttn-provision-org")` - Edge function to regenerate webhook secret

**Purpose**:

- Manages TTN webhook configuration (edit, save, regenerate secret)
- Uses edge function for webhook secret regeneration

**Status**: BLOCKED - Requires backend TTN SDK integration
**Priority**: Low (webhook config is one-time setup)
**Notes**: Should be refactored to tRPC once backend TTN SDK integration is available

---

### File 3: src/hooks/useTTNOperations.ts

**File Path**: `src/hooks/useTTNOperations.ts`  
**Number of Supabase Calls**: 1  
**Type of Operations**: Edge Function

**Supabase Operations**:

1. `supabase.functions.invoke("ttn-provision-org")` - Edge function to provision TTN application

**Purpose**:

- Handles TTN provisioning, testing, and toggle operations
- Uses edge function for initial application provisioning

**Status**: TEMPORARY - Provisioning operations still use edge functions (to be migrated)
**Priority**: Medium (provisioning is required for TTN integration setup)
**Notes**: Should be refactored to backend BullMQ job when ttn-provision-org edge function is replaced

---

## 2. Dashboard Layout System

### File 4: src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts

**File Path**: `src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts`  
**Number of Supabase Calls**: 5  
**Type of Operations**: Query, Mutation (Insert, Update, Delete)

**Supabase Operations**:

1. `supabase.from("entity_dashboard_layouts").select("*")` - Query to fetch saved layouts
2. `supabase.from("entity_dashboard_layouts").insert()` - Mutation to save new layout
3. `supabase.from("entity_dashboard_layouts").update()` - Mutation to update existing layout
4. `supabase.from("entity_dashboard_layouts").delete()` - Mutation to delete layout
5. `supabase.from("entity_dashboard_layouts").update({ is_user_default: true })` - Mutation to set default layout

**Purpose**:

- Manages entity (unit or site) dashboard layouts
- Handles layout CRUD operations with TanStack React Query caching

**Status**: ACTIVE - Core functionality for dashboard customization
**Priority**: High (frequently used by users for dashboard personalization)
**Notes**: Should be refactored to tRPC for consistency and security

---

### File 5: src/lib/observability/widgetHealthMetrics.ts

**File Path**: `src/lib/observability/widgetHealthMetrics.ts`  
**Number of Supabase Calls**: 1  
**Type of Operations**: Mutation (Batch Insert)

**Supabase Operations**:

1. `supabase.from("event_logs").insert(eventLogs)` - Batch insert to log widget health status changes

**Purpose**:

- Tracks widget health status changes and failure layers
- Buffers events in memory and periodically flushes to database
- Provides health distribution and failure analysis metrics

**Status**: ACTIVE - Observability and diagnostics feature
**Priority**: Medium (important for debugging widget issues)
**Notes**: Should be refactored to tRPC for better error handling and consistency

---

## 3. Health Check System

### File 6: src/lib/health/healthChecks.ts

**File Path**: `src/lib/health/healthChecks.ts`  
**Number of Supabase Calls**: 6  
**Type of Operations**: Edge Function, RPC, Query

**Supabase Operations**:

1. `supabase.functions.invoke(fn.name)` - Edge function calls to check edge function health (multiple functions)
2. `supabase.rpc('check_slug_available')` - RPC call to test database connectivity
3. `supabase.from('organizations').select('id').limit(1)` - Query to test table access and RLS
4. `supabase.from('ttn_connections').select()` - Query to check TTN configuration

**Purpose**:

- Runs health checks on system components (edge functions, database, TTN)
- Computes overall system health status
- Provides detailed health check results for debugging

**Status**: ACTIVE - System monitoring and diagnostics feature
**Priority**: Medium (used for system health monitoring)
**Notes**: Should be refactored to tRPC for consistent error handling and rate limiting

---

## 4. Soft Delete Functionality

### File 7: src/hooks/useSoftDelete.ts

**File Path**: `src/hooks/useSoftDelete.ts`  
**Number of Supabase Calls**: 11+  
**Type of Operations**: Query, Mutation (Update)

**Supabase Operations**:

1. `supabase.from("units").select()` - Query to get unit information
2. `supabase.from("areas").select()` - Query to get area information
3. `supabase.from("sites").select()` - Query to get site information
4. `supabase.from("devices").select()` - Query to get device information
5. `supabase.from("lora_sensors").select()` - Query to get sensor information
6. `supabase.from("lora_sensors").update()` - Mutation to soft delete sensor
7. `supabase.from("devices").update()` - Mutation to soft delete devices (cascade)
8. `supabase.from("units").select()` - Query to check for active units in area
9. `supabase.from("units").update()` - Mutation to restore unit
10. `supabase.from("areas").update()` - Mutation to restore area
11. Additional queries for cascade delete operations

**Purpose**:

- Handles soft deletion and restoration of entities (units, areas, sites, devices, sensors)
- Manages cascade delete operations
- Tracks deletion events in event logs

**Status**: ACTIVE - Core data management functionality
**Priority**: High (frequently used by users for entity management)
**Notes**: Should be refactored to tRPC for consistency and security. Some operations already use API endpoints.

---

## Summary

### Total Supabase Calls: ~30 calls across 7 files

### Priority Breakdown:

- **High Priority**: 2 files (useEntityLayoutStorage.ts, useSoftDelete.ts) - Core user-facing functionality
- **Medium Priority**: 2 files (useTTNOperations.ts, widgetHealthMetrics.ts) - Important features but not daily operations
- **Low Priority**: 3 files (useTTNDeprovision.ts, useTTNWebhook.ts, healthChecks.ts) - Infrequent or admin-only operations

### Migration Strategy:

1. Start with high priority files (useEntityLayoutStorage.ts, useSoftDelete.ts)
2. Move to medium priority files (useTTNOperations.ts, widgetHealthMetrics.ts)
3. Address low priority files (useTTNDeprovision.ts, useTTNWebhook.ts, healthChecks.ts) once backend dependencies are resolved

All operations should be refactored to tRPC for:

- Consistent error handling
- Better security with proper authentication and authorization
- Improved type safety
- Centralized API documentation
- Easier debugging and monitoring
