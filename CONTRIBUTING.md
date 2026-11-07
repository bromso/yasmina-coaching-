# Contributing to boilerplate-bun

Thank you for your interest in contributing! This is a quick reference guide covering everything you need to get started.

## Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/boilerplate-bun.git
cd boilerplate-bun

# 2. Install dependencies
bun install

# 3. Create a branch
git switch -c feat/your-feature-name

# 4. Start development
bun dev
```

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/description` | `feat/user-settings` |
| Bug fix | `fix/description` | `fix/login-redirect` |
| Docs | `docs/description` | `docs/api-reference` |
| Chore | `chore/description` | `chore/update-deps` |

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint:
`type(scope): subject`, lower-case type, no trailing period, header at most 100 characters.
Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`. A [Gitmoji](https://gitmoji.dev/) after the colon is optional — commitlint accepts it but
doesn't require it.

**Recommended**: Use the [VS Code Conventional Commits extension](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits) for guided commits.

```bash
# Format: type(scope): description   — scope and emoji are optional
git commit -m "feat(auth): add password reset flow"
git commit -m "fix(ui): resolve button hover state"
git commit -m "docs: :memo: update installation steps"
```

### Commit Types & Common Emojis (optional)

| Type | Emoji | Code | Description |
|------|-------|------|-------------|
| `feat` | :sparkles: | `:sparkles:` | New feature |
| `fix` | :bug: | `:bug:` | Bug fix |
| `fix` | :rotating_light: | `:rotating_light:` | Linting/type fixes |
| `fix` | :passport_control: | `:passport_control:` | Auth/security fix |
| `docs` | :memo: | `:memo:` | Documentation |
| `style` | :lipstick: | `:lipstick:` | UI/styling |
| `style` | :bento: | `:bento:` | Assets |
| `refactor` | :recycle: | `:recycle:` | Code refactoring |
| `refactor` | :children_crossing: | `:children_crossing:` | UX improvements |
| `test` | :white_check_mark: | `:white_check_mark:` | Tests |
| `chore` | :technologist: | `:technologist:` | Developer experience |
| `chore` | :fire: | `:fire:` | Remove code/files |
| `perf` | :zap: | `:zap:` | Performance |
| `build` | :construction_worker: | `:construction_worker:` | Build/CI |

### Commit Category & Common Emojis

| Category | Emoji | Code | Description |
|----------|-------|------|-------------|
| `ui` | :art: | `:art:` | UI/UX improvements |
| `infrastructure` | :building_construction: | `:building_construction:` |
| `api` | :gear: | `:gear:` | API changes |
| `dependencies` | :package: | `:package:` | Dependency updates |
| `docs` | :book: | `:book:` | Documentation updates |
| `tests` | :test_tube: | `:test_tube:` | Testing improvements |
| `ci` | :robot: | `:robot:` | CI/CD changes |
| `config` | :wrench: | `:wrench:` | Configuration changes |
| `security` | :lock: | `:lock:` | Security fixes |
| localization | :globe_with_meridians: | `:globe_with_meridians:` | Localization/internationalization |
| performance | :rocket: | `:rocket:` | Performance improvements |
| accessibility | :wheelchair: | `:wheelchair:` | Accessibility improvements |
| documentation | :page_facing_up: | `:page_facing_up:` | Documentation improvements |
| testing | :microscope: | `:microscope:` | Testing improvements |
| refactoring | :twisted_rightwards_arrows: | `:twisted_rightwards_arrows:` | Code refactoring |
| tooling | :hammer_and_wrench: | `:hammer_and_wrench:` | Tooling changes |
| experiments | :test_tube: | `:test_tube:` | Experimental code |
| maintenance | :broom: | `:broom:` | Maintenance tasks |
| release | :tada: | `:tada:` | Release commits |
| documentation | :information_source: | `:information_source:` | Important information |
| warning | :warning: | `:warning:` | Warnings or cautions |
| bug | :beetle: | `:beetle:` | Bug-related changes |
| enhancement | :sparkle: | `:sparkle:` | Enhancements or improvements |

See the full [gitmoji reference](https://gitmoji.dev/) for more emojis.

## Git Hooks

This repository uses automated Git hooks to maintain code quality:

### Pre-commit Hook
Runs [lint-staged](https://github.com/lint-staged/lint-staged): `biome check --write` on staged
JS/TS files and `biome format --write` on staged JSON.

### Commit Message Validation
Validates commit message format against Conventional Commits using [commitlint](https://commitlint.js.org/).

### Interactive Commits (Recommended)
Use the interactive commit helper for guided commits:

```bash
bun run commit
```

This launches [Commitizen](https://github.com/commitizen/cz-cli) which walks you through creating a properly formatted commit message.

### Bypassing Hooks (Emergency Only)

In rare cases where you need to bypass hooks:

```bash
# Skip all hooks
git commit --no-verify -m "your message"

# Or set HUSKY=0
HUSKY=0 git commit -m "your message"
```

> **Note**: Bypassing hooks should be rare. CI will still validate commits.

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
bun run lint       # Check lint issues
bun run lint:fix   # Auto-fix lint issues
bun run format     # Check formatting
bun run format:fix # Auto-fix formatting
```

## Before You Open a PR

Run the same gate CI runs:

```bash
bun run ci   # biome ci, typechecks, @repo/ui typecheck, service tests (api + ai), full build
```

`bun run validate` runs the same checks with human-readable Biome output. If you changed a
Dockerfile or dependencies, also build an image — CI's `docker` job builds `app`, `api` and `ai`:

```bash
docker build -f docker/next.Dockerfile --build-arg APP=app --build-arg PORT=3001 .
```

Add a changeset (`bun run changeset`) for user-facing changes to a versioned package.

## Pull Requests

1. Create a PR with a descriptive title (conventional commit format)
2. Link related issues using `Fixes #123`
3. Fill out the PR template
4. Ensure CI passes
5. Request review

## Need Help?

- **Issues**: [Browse open issues](https://github.com/bromso/boilerplate-bun/issues)
- **Component docs**: Run `bun run story` and visit http://localhost:6006

## Code of Conduct

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before contributing.
