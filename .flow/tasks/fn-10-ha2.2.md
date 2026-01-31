# fn-10-ha2.2 Add bundle size reporting to CI

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

## Summary

Added bundle size reporting job to CI workflow. The `bundle-size` job runs in parallel with other CI jobs (informational, never blocks). It builds the frontend, then generates a GitHub Actions Job Summary with a markdown table showing per-file raw and gzip sizes for all JS and CSS assets, plus totals.

### Files Changed

- `.github/workflows/ci.yml` — added `bundle-size` job (74 lines)

### Key Decisions

- Used shell-native `wc -c` and `gzip -c | wc -c` for size measurement (zero dependencies)
- Human-readable kB/MB formatting with awk
- GitHub Step Summary for output (native CI integration)
- No blocking — job has no `needs:` clause, runs independently

### Review Status

Both review backends unavailable (rp-cli not installed, codex rate-limited). Implementation verified by reading commit diff and CI YAML.

## Evidence

- Commits: 02fca83 feat(ci): add bundle size reporting to CI workflow
- Tests: CI YAML valid - bundle-size job added at lines 127-199, informational only
- PRs:
