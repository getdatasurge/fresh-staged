---
phase: 4
plan: fix-types
wave: 1
---

# Plan 4-fix-types: Install missing TypeScript declarations

## Objective
Add missing type declarations for `react-router-dom` and `lucide-react` so the project builds without type errors.

## Steps
1. Run in project root:
   ```bash
   npm i -D @types/react-router-dom @types/lucide-react
   ```
   (If `@types/lucide-react` does not exist, the install will be a no‑op; the library already ships types.)
2. Verify that `tsc --noEmit` passes.
3. Run `npm run lint` to ensure no remaining lint errors.
4. Commit the changes.

## Verification
- `npm run typecheck` succeeds.
- `npm run lint` reports zero errors.

## Done
- Types installed and project builds.
