# fn-5-mw0 DX Tooling: Prettier, Husky, lint-staged

## Overview

Add code formatting and pre-commit enforcement. Currently the project has ESLint (flat config) but NO Prettier, NO Husky, NO lint-staged, and NO pre-commit hooks. All formatting is manual.

## Scope

- Add Prettier with config matching existing code style
- Add Husky v9 for git hooks
- Add lint-staged to run ESLint + Prettier on staged files only
- Wire pre-commit hook: lint-staged
- Do NOT change existing ESLint flat config (eslint.config.js)
- Do NOT enforce on full codebase in one shot (format incrementally)

## Approach

1. Install Prettier, create `.prettierrc` matching current code patterns (single quotes, trailing commas, 100 char width)
2. Install Husky v9 via `npx husky init`, create `.husky/pre-commit` running `npx lint-staged`
3. Install lint-staged, configure in package.json: `*.{ts,tsx}` -> eslint --fix + prettier --write, `*.{json,css,md}` -> prettier --write
4. Add `prepare: "husky"` to package.json scripts
5. Run Prettier on existing codebase in a single formatting commit (separate from feature work)
6. Add `.prettierignore` for dist/, coverage/, node_modules/

## Quick commands

- `npx prettier --check .`
- `npx prettier --write .`
- `pnpm lint`

## Acceptance

- [ ] `.prettierrc` exists with documented style choices
- [ ] Husky v9 installed with `.husky/pre-commit` hook
- [ ] lint-staged configured to run on `*.{ts,tsx,json,css,md}`
- [ ] Pre-commit hook blocks commits with lint/format errors
- [ ] Existing codebase formatted in one clean commit
- [ ] CI still passes after formatting

## References

- Practice scout: Husky v9 removed `husky add`, no shebang needed, use `prepare: "husky"` not `postinstall: "husky install"`
- Repo scout: No `.prettierrc`, no `.husky/`, no lint-staged found in project
- ESLint flat config at `eslint.config.js`
