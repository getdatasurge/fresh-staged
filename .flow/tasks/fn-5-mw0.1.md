# fn-5-mw0.1 Install and configure Prettier

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

Installed prettier 3.8.1 as root devDependency. Created .prettierrc with singleQuote, trailingComma all, printWidth 100, semi true, tabWidth 2. Created .prettierignore excluding dist, coverage, node_modules, build, .next, drizzle, supabase, and lockfiles. Added format and format:check scripts to root package.json.

## Evidence

- Commits: 8ef8410c2084a5b854677152025f65934670198f
- Tests: npx prettier --check src/App.tsx, npx prettier --check .prettierrc
- PRs:
