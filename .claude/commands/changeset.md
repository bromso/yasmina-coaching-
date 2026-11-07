# Changeset Management

Manage releases with Changesets.

## Arguments
- `$ARGUMENTS` - Optional action: `add`, `version`, or `status`

## Instructions

Based on the argument provided, run the appropriate changeset command:

1. **No argument or `add`**: Create a new changeset
   ```bash
   bun changeset
   ```
   This is interactive - help the user select packages and write a changelog entry.

2. **`version`**: Apply version bumps from pending changesets
   ```bash
   bun changeset:version
   ```
   Report which packages were versioned and their new versions.

3. **`status`**: Show pending changesets
   ```bash
   bunx changeset status
   ```
   List all pending changesets and what packages/versions they affect.

For the `add` command, guide the user through:
- Selecting affected packages
- Choosing version bump type (patch, minor, major)
- Writing a meaningful changelog entry
