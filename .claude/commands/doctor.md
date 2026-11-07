# Environment Doctor

Validate the development environment setup.

## Instructions

Run the environment validation command:

```bash
bun doctor
```

After running, analyze the output and report:
- Environment status (healthy or issues found)
- Any missing dependencies or configuration problems
- Suggested fixes for any issues detected

If the doctor command doesn't exist, perform manual checks:
1. Verify Bun is installed: `bun --version`
2. Verify Node.js is installed: `node --version`
3. Check if dependencies are installed: `ls node_modules`
4. Verify Bun workspaces are configured: `bun pm ls --all`
5. Check for required environment files: `.env` or `.env.local` in apps that need them
