# Security Policy

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Use GitHub Security Advisories** (Preferred)

1. Go to the [Security tab](https://github.com/bromso/boilerplate-bun/security) of this repository
2. Click "Report a vulnerability"
3. Fill out the private security advisory form
4. We will respond within 48 hours

This method keeps the report private until a fix is available.

> **Repository owners:** the "Report a vulnerability" button exists only when private vulnerability
> reporting is enabled (Settings → Code security → Private vulnerability reporting), which GitHub
> offers for public repositories. Until then, add a private address (e.g. `security@<your domain>`)
> to **Contact** below so reporters have a way to reach you that is not public.

### What to Include

When reporting a vulnerability, please include:

- **Description** - Clear explanation of the vulnerability
- **Steps to Reproduce** - Detailed steps to reproduce the issue
- **Impact** - Potential impact and severity assessment
- **Affected Components** - Which apps/packages are affected
- **Suggested Fix** - If you have recommendations (optional)

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Response Timeline

| Stage | Timeline |
|-------|----------|
| Initial Response | Within 48 hours |
| Status Update | Within 7 days |
| Fix Timeline | Based on severity |

## Severity Levels

| Level | Description | Response |
|-------|-------------|----------|
| **Critical** | Data breach, RCE, auth bypass | Immediate priority |
| **High** | Significant data exposure, privilege escalation | High priority |
| **Medium** | Limited impact, requires user interaction | Standard priority |
| **Low** | Minimal impact, edge cases | Scheduled fix |

## How We Scan

Every pull request runs a secrets scan (Gitleaks) over its own commits. One that changes
dependencies (the lockfile, a `package.json` or a root file) also runs a dependency audit
(`bun audit`), and one that can affect a Docker image builds that image and scans it (Trivy). A
weekly run on `main` repeats the audit and all three image scans, so an advisory published after a
PR merges doesn't wait for the next PR to touch that dependency to be noticed.
A reviewed, expiring allowlist (`security/allowlist.json`) is the only way to accept a known risk.
See [docs/guides/security-scanning.md](./docs/guides/security-scanning.md) for what each scan
covers, reading a failure, and writing an allowlist entry. Found a real secret in the repository's
history? Report it the way above — rotating the credential is the first step, whatever follows.

## Out of Scope

The following are not considered security vulnerabilities:

- Issues in dependencies without a clear exploit path
- Social engineering attacks
- Physical security issues
- Denial of service attacks
- Issues requiring unlikely user interaction
- Spam or rate limiting concerns
- Missing security headers without demonstrated impact

## Recognition

We appreciate responsible disclosure. Contributors who report valid security issues may be acknowledged in our release notes (with permission).

## Contact

For questions about this policy (never details of a vulnerability), open an
[issue](https://github.com/bromso/boilerplate-bun/issues/new/choose).
