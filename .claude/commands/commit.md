# Git Commit with Conventional Commits

Create a git commit using conventional commits format with emojis.

## Arguments

- `$ARGUMENTS` - Optional: specific files to commit, or commit type override

## Instructions

### 1. Analyze Changes

First, gather information about the changes:

```bash
git status
```

```bash
git diff --staged
```

If nothing is staged, also check unstaged changes:

```bash
git diff
```

### 2. Determine Commit Type

Based on the changes, select the appropriate type and emoji:

| Type | Emoji | Description |
|------|-------|-------------|
| `feat` | ✨ | New feature |
| `fix` | 🐛 | Bug fix |
| `docs` | 📚 | Documentation changes |
| `style` | 💄 | Code style/formatting (no logic change) |
| `refactor` | ♻️ | Code refactoring |
| `perf` | ⚡ | Performance improvement |
| `test` | 🧪 | Adding or updating tests |
| `build` | 📦 | Build system or dependencies |
| `ci` | 🔧 | CI/CD configuration |
| `chore` | 🔨 | Maintenance tasks |
| `revert` | ⏪ | Reverting changes |

### 3. Generate Commit Message

Format the commit message as:

```
<type>: <emoji> <short description>

<detailed description of changes>

<breaking changes or related issues>
```

**Guidelines:**
- Short description: imperative mood, lowercase, no period, max 50 chars
- Detailed description: explain what and why, not how
- List each changed file/component and what was modified
- Note any breaking changes with `BREAKING CHANGE:` prefix
- Reference issues with `Fixes #123` or `Closes #123`

### 4. Stage and Commit

If files aren't staged, ask the user which files to stage or offer to stage all:

```bash
git add <files>
```

Create the commit:

```bash
git commit -m "<message>"
```

Use a HEREDOC for multi-line messages:

```bash
git commit -m "$(cat <<'EOF'
<type>: <emoji> <short description>

<detailed description>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 5. Confirm

After committing, show:
- The commit hash
- The full commit message
- Changed files summary

## Examples

**Feature commit:**
```
feat: ✨ add user authentication flow

Implement login and registration pages with form validation.
- Add LoginForm component with email/password fields
- Add RegisterForm with validation using Zod
- Create auth API routes for session management
- Add protected route middleware

Closes #42
```

**Bug fix commit:**
```
fix: 🐛 resolve null pointer in user profile

Fix crash when accessing profile before data loads.
- Add loading state check in UserProfile component
- Handle undefined user gracefully in avatar display

Fixes #87
```

**Breaking change commit:**
```
refactor: ♻️ restructure API response format

Standardize all API responses to use new envelope format.
- Wrap all responses in { data, error, meta } structure
- Update all API route handlers
- Migrate frontend API calls to new format

BREAKING CHANGE: API responses now use envelope format.
All clients must update to handle new response structure.
```
