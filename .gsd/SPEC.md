# tRPC Refactor Specification
Status: FINALIZED

## Goal
Migrate the FrostGuard frontend from direct Supabase SDK calls to tRPC for improved type safety, better developer experience, and centralized business logic.

## Strategy
- Wave 1: Core Dashboard (Units, Sites, Areas)
- Wave 2: Secondary Views (Alerts, History, Settings)
- Wave 3: Platform & Admin (SuperAdmin tools)

## Implementation Rules
- Always use `useTRPC` and `useTRPCClient` hooks.
- Map backend camelCase results to legacy snake_case if necessary for component compatibility.
- Prefer `useQuery` for data fetching and `useMutation` for actions.
- Centralize all API logic in `backend/src/routers`.
