# fn-5-mw0.2 Install Husky v9 + lint-staged with pre-commit hook

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

Installed Husky v9.12.2 and lint-staged 16.2.7 as root devDependencies. Initialized Husky with `npx husky init`, creating `.husky/pre-commit` hook that runs `npx lint-staged`. Configured lint-staged in package.json: `*.{ts,tsx}` files get `eslint --fix` + `prettier --write`, `*.{json,css,md}` files get `prettier --write`. Added `prepare: "husky"` script to package.json for automatic hook installation on `pnpm install`.

## Evidence

- Commits:
- Tests: npx lint-staged --diff=HEAD~1 completes successfully, cat .husky/pre-commit shows npx lint-staged, grep lint-staged package.json shows config
- PRs:
