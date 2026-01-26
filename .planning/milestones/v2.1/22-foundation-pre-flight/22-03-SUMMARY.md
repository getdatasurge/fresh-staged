---
phase: 22-foundation-pre-flight
plan: 03
subsystem: deployment-scripts
tags: [bash, checkpoint, resume, rollback, error-recovery]

dependency-graph:
  requires: [22-01]
  provides: [checkpoint-resume-system, error-state-persistence, interactive-recovery]
  affects: [22-04, 22-05, 23-*, 24-*, 25-*, 26-*]

tech-stack:
  added: []
  patterns:
    - checkpoint-files: "STATE_DIR/.checkpoint-{name} with ISO timestamps"
    - error-state: "STATE_DIR/.last-error with script/line/exit_code/category"
    - recovery-prompts: "Interactive prompts based on error category"

key-files:
  created: []
  modified:
    - scripts/lib/preflight-lib.sh

decisions:
  - "STATE_DIR fallback: /var/lib/freshtrack-deploy with SCRIPT_DIR/.deploy-state fallback"
  - "Interactive recovery only when stdin is terminal ([[ -t 0 ]])"
  - "Critical and fatal errors always abort without retry prompt"
  - "Transient and recoverable errors default to retry (Y/n prompt)"

metrics:
  duration: ~8 minutes
  completed: 2026-01-25
---

# Phase 22 Plan 03: Checkpoint & Resume System Summary

Checkpoint-based resume and rollback capabilities for idempotent deployment scripts.

## One-liner

Checkpoint state management with error persistence and category-based interactive recovery prompts.

## What Was Built

### Checkpoint State Management
- `STATE_DIR` configuration with `/var/lib/freshtrack-deploy` default
- `ensure_state_dir()` with automatic fallback to local directory
- `checkpoint_done()` checks if checkpoint file exists
- `checkpoint_time()` returns timestamp of checkpoint completion
- `checkpoint_set()` writes ISO-8601 timestamp to checkpoint file
- `checkpoint_clear()` removes single checkpoint
- `checkpoint_clear_all()` removes all checkpoints and error state
- `run_step()` orchestrates step execution with automatic skip/checkpoint

### Error State Persistence
- `save_error_state()` writes timestamp, script, line, exit_code, category
- `load_error_state()` sources error file to restore variables
- Error state saved in `STATE_DIR/.last-error`

### Interactive Recovery Handler
- `handle_recovery()` prompts user based on error category
- Transient errors: "Retry now? [Y/n]" with auto-retry default
- Recoverable permission: Shows sudo/ownership suggestions, retry prompt
- Recoverable resource: Shows prune/free/df suggestions, retry prompt
- Critical errors: Shows rollback commands, always aborts
- Fatal errors: Shows signal information, always aborts
- Unknown errors: Conservative "Retry? [y/N]" prompt

### Updated Error Handler
- `error_handler()` now calls `save_error_state()` after diagnostics
- Calls `handle_recovery()` only in interactive mode (`[[ -t 0 ]]`)
- On retry, executes `exec "$0" "$@"` to restart script

### Self-Tests Added
- Test 4: Checkpoint functions (done, set, clear, time)
- Test 5: Error state functions (save, load, verify values)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 6a1f664 | feat | Add checkpoint functions for state tracking |
| 94d1233 | feat | Add error state persistence and recovery handling |

## Files Changed

| File | Changes |
|------|---------|
| scripts/lib/preflight-lib.sh | +211 lines (checkpoint, error state, recovery, tests) |

## Verification Results

1. Functions exist: All 6 required functions (checkpoint_done, checkpoint_set, checkpoint_clear, run_step, save_error_state, handle_recovery)
2. Self-tests pass: All 5 test sections pass
3. run_step skips completed: "[SKIP] step-name (completed at: timestamp)"
4. Error state persists: File contains script, line, exit_code, category

## Success Criteria Met

- [x] ERROR-04: Critical failures trigger rollback guidance (docker compose logs, journalctl -xe, ./scripts/rollback.sh)
- [x] ERROR-05: Recoverable failures prompt user with fix suggestions and retry option
- [x] error_handler automatically calls handle_recovery for interactive prompts
- [x] Checkpoint files created in STATE_DIR with timestamps
- [x] run_step skips already-completed steps on re-run
- [x] save_error_state captures line, script, exit code, category

## Deviations from Plan

None - plan executed exactly as written.

## Integration Notes

### For 22-04 (Pre-Flight Orchestrator)
The orchestrator can now use `run_step` to wrap each validation:

```bash
run_step "validate-ram" validate_ram 2048
run_step "validate-disk" validate_disk 10
run_step "install-docker" install_docker
```

On failure, `handle_recovery` will:
1. Save error state for diagnostics
2. Prompt user with category-specific guidance
3. Offer retry for transient/recoverable errors
4. Show rollback commands for critical errors

### Resume Flow
On script re-run:
1. Each `run_step` checks `checkpoint_done`
2. Completed steps show `[SKIP]` with timestamp
3. Execution resumes from first incomplete step
4. On success, checkpoint is set for next run

## Next Phase Readiness

Phase 22-04 (Pre-Flight Orchestrator) is unblocked. The checkpoint system enables:
- Idempotent pre-flight checks
- Resume from failure point
- Interactive recovery for operator-assisted deployments
- Error state debugging for failed deployments
