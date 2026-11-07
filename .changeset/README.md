# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management and GitHub releases.

## Adding a Changeset

When you make changes that should be released, run:

```bash
bun changeset
```

This will prompt you to:
1. Select which packages have changed
2. Choose the semver bump type (major/minor/patch)
3. Write a summary of the changes

## Version Types

- **patch**: Bug fixes, small changes (0.0.X)
- **minor**: New features, non-breaking changes (0.X.0)
- **major**: Breaking changes (X.0.0)

## Release Process

1. Create changesets for your changes during development
2. Push to a feature branch and open a PR
3. When merged to `main`, the release workflow:
   - Creates a "Version Packages" PR with all pending changesets
   - When that PR is merged, creates GitHub releases with tags

## Commands

```bash
bun changeset           # Add a new changeset
bun changeset:version   # Apply changesets and bump versions
bun changeset:publish   # Create git tags for releases
```

## Configuration

Config is in `.changeset/config.json`:
- **fixed**: All main packages (`@repo/app`, `@repo/www`, `@repo/ui`, `@repo/tokens`, `@repo/typescript-config`) are versioned together as a unified release
- **ignored**: Docs, legal, and story are excluded from versioning
- **changelog**: Uses GitHub format with PR/commit links
- **privatePackages**: Enabled for version and tag creation
