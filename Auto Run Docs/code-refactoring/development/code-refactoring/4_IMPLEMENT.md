# Refactoring Implementation - Execute Safe Refactors

## Context

- **Playbook:** Refactor
- **Agent:** dataSURGE - codex
- **Project:** Z:\home\swoop\swoop-claude-projects\fresh-staged
- **Auto Run Folder:** Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs
- **Loop:** 00001

## Objective

Implement ONE refactoring candidate from `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md` that has status `PENDING` and meets criteria (LOW risk + HIGH/VERY HIGH benefit). Log all changes to `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md`.

## Instructions

1. **Read `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md`** to find evaluated refactoring candidates
2. **Filter for actionable items**: Only consider candidates where:
   - **Status = `PENDING`** (exactly - not `PENDING - MANUAL REVIEW` or `WON'T DO`)
   - **Risk = LOW** (not MEDIUM or HIGH)
   - **Benefit = HIGH or VERY HIGH** (not LOW or MEDIUM)
3. **Select ONE candidate** that meets all criteria (prioritize VERY HIGH benefit over HIGH)
4. **Implement the refactoring**: Make the code changes as specified
5. **Verify the change**: Ensure the code still works (syntax check, no obvious errors)
6. **Log the change** to `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md`
7. **Update status** in `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md` to `IMPLEMENTED`

## Task

- [ ] **Implement one PENDING refactor (or skip if none)**: Read Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md. If the file doesn't exist OR contains no items with status exactly `PENDING` that also have LOW risk AND HIGH/VERY HIGH benefit, mark this task complete without changes. Otherwise, find ONE item that meets all criteria, implement the refactoring, log to Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md, and mark as IMPLEMENTED in Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md.

## Implementation Checklist

Before implementing, verify:

- [ ] The status is exactly `PENDING` (not `PENDING - MANUAL REVIEW`)
- [ ] Risk is LOW (not MEDIUM or HIGH)
- [ ] Benefit is HIGH or VERY HIGH (not LOW or MEDIUM)
- [ ] The refactor is clearly specified with before/after code or description
- [ ] No other changes are required (no dependencies)

## Implementation Guidelines

### Before Each Refactor

1. Read the current file content
2. Understand the proposed change
3. Verify the change is still applicable
4. Check for any obvious issues

### During Refactor

1. Make the smallest change that achieves the goal
2. Preserve existing behavior exactly
3. Maintain code style consistency
4. Update imports if moving code

### After Each Refactor

1. Update status to `IMPLEMENTED` in the plan
2. Add entry to the refactor log
3. Note any follow-up work needed

## What to Implement (By Category)

### File Size Refactors (LOW Risk)

- Extract clearly separable functions to new files
- Move utilities from component files to utils/
- Split large files along clear boundaries

### Duplication Refactors (LOW Risk)

- Extract repeated code blocks to shared functions
- Parameterize nearly-identical functions
- Create shared utilities for common patterns

### Complexity Refactors (LOW Risk)

- Extract deeply nested logic to helper functions
- Break long functions into smaller named steps
- Extract complex conditionals to named predicates

### Dead Code Refactors (LOW Risk)

- Remove unused imports
- Remove commented-out code
- Remove unused private functions (after verification)

### Organization Refactors (LOW Risk)

- Add module re-exports or entry point files for cleaner imports
- Move misplaced utilities to appropriate directories
- Consolidate scattered constants

## Log Format

Append to `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md`:

```markdown
## Loop 00001 - [Timestamp]

### Implemented Refactors

#### 1. [Candidate Name]

- **File(s):** `path/to/file`
- **Category:** [File Size / Duplication / Complexity / etc.]
- **Change:** [Brief description of what was done]
- **Lines Changed:** [Approximate +/- lines]
- **New Files:** [Any new files created, if applicable]
- **Notes:** [Any relevant observations]

#### 2. [Candidate Name]

...

### Skipped (This Loop)

- [Candidate X] - PENDING - MANUAL REVIEW
- [Candidate Y] - WON'T DO: [brief reason]
- [Candidate Z] - MEDIUM risk, needs review

### Statistics

- **Candidates Evaluated:** [Total in plan]
- **Implemented:** [Count]
- **Skipped (Manual Review):** [Count]
- **Skipped (Won't Do):** [Count]
- **Remaining PENDING:** [Count]
```

## Safety Checks

Before implementing each refactor:

1. **Scope Check**: Is this change confined to the expected files?
2. **Import Check**: Will this break any imports?
3. **Export Check**: Are we changing any public interfaces?
4. **Style Check**: Does the refactored code match project style?

## Guidelines

- **Only `PENDING` items**: Do NOT implement `PENDING - MANUAL REVIEW` or `WON'T DO` items
- **One refactor per run**: Implement exactly ONE refactor, then stop. This keeps changes small and reviewable.
- **Follow the plan**: Implement exactly what was proposed in `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md`, don't improvise
- **Update both files**: Log to `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md` AND update status in `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md`
- **Be conservative**: If anything is unclear about the refactor, skip it and note why in the log file
- **Preserve behavior**: Refactoring must not change functionality

## How to Know You're Done

This task is complete when ONE of the following is true:

**Option A - Implemented a refactor:**

1. You've implemented exactly ONE refactor from `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md`
2. You've appended the change details to `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md`
3. You've updated the item status in `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/LOOP_00001_PLAN.md` to `IMPLEMENTED`

**Option B - No PENDING refactors available:**

1. `LOOP_00001_PLAN.md` doesn't exist, OR
2. It contains no items with status exactly `PENDING` that meet criteria (LOW risk + HIGH/VERY HIGH benefit)
3. Mark this task complete without making changes

This graceful handling allows the pipeline to continue when a loop iteration produces no actionable refactors.

## When No Refactors Are Available

If there are no items with status exactly `PENDING` (meeting criteria) in the plan file, append to `Z:\home\swoop\swoop-claude-projects\fresh-staged\Auto Run Docs/REFACTOR_LOG_dataSURGE - codex_2026-01-30.md`:

```markdown
---

## [YYYY-MM-DD HH:MM] - Loop 00001 Complete

**Agent:** dataSURGE - codex
**Project:** dataSURGE - codex
**Loop:** 00001
**Status:** No PENDING refactors available (or no qualifying candidates)

**Summary:**

- Items IMPLEMENTED: [count]
- Items WON'T DO: [count]
- Items PENDING - MANUAL REVIEW: [count]
- Items PENDING but not qualifying (wrong risk/benefit): [count]

**Recommendation:** [Either "All automatable refactors implemented" or "Remaining items need manual review or have higher risk"]
```

This signals to the pipeline that this loop iteration is complete.
