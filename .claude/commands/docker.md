# Docker Operations

Manage Docker containers for the project.

## Arguments
- `$ARGUMENTS` - Action and optional app: `build [app]`, `up [app]`, `down`, or `dev`

Services (same names and ports as `bun dev`): `www` 3000, `app` 3001, `auth` 3002, `account` 3003,
`docs` 3004, `help` 3005, `jobs` 3006, `api` 3007, `ai` 3008. Next apps build from
`docker/next.Dockerfile`, the Bun services (`api`, `ai`) from `docker/bun-service.Dockerfile`.

## Instructions

Parse the arguments and run the appropriate Docker command:

1. **`build [app]`**: Build Docker image(s)
   - With app name: `docker compose build <app>` (e.g. `docker compose build www`)
   - Without app: `docker compose build` to build all images

2. **`up [app]`**: Start production-like containers
   ```bash
   docker compose up -d --build [app]
   ```
   `api` needs `API_SERVICE_TOKEN` and `ai` needs `AI_SERVICE_TOKEN` (each at least 32 characters —
   `openssl rand -hex 32`; and `ANTHROPIC_API_KEY`, unless `AI_MODEL=mock:echo`) in the root
   `.env`; without them they exit at startup and say what is missing.

3. **`down`**: Stop and remove containers
   ```bash
   docker compose down
   ```

4. **`dev`**: Start the development container (all apps, hot reload, source bind-mounted)
   ```bash
   docker compose -f docker-compose.dev.yml up
   ```

Report:
- Container status and health (`docker compose ps`) after operations
- Any errors or issues encountered
- Port mappings for running services
