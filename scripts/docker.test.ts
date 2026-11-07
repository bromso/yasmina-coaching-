import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SITES } from "../packages/sites/src/index"

// The Docker and devcontainer files list every app and workspace by hand. Nothing builds the dev
// stack or the devcontainer in CI, so these tests are what notices a new workspace left out.
const ROOT = join(import.meta.dir, "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")
const workspaces = (dir: string) =>
  readdirSync(join(ROOT, dir)).filter((name) => existsSync(join(ROOT, dir, name, "package.json")))
const isNext = (app: string) =>
  ["next.config.mjs", "next.config.ts"].some((f) => existsSync(join(ROOT, "apps", app, f)))

/** Every deployable app: the Next apps plus the two Bun services, with their ports. */
const SERVICES: Record<string, number> = {
  ...Object.fromEntries(Object.entries(SITES).map(([id, site]) => [id, site.port])),
  api: 3007,
  ai: 3008,
}

/** A long-syntax `ports` entry (`{ target, published, host_ip }`), next to the short `"h:p"` one. */
type PortObject = { target?: number | string; published?: number | string; host_ip?: string }

type Service = {
  image?: string
  pull_policy?: string
  build?: { dockerfile: string; args: Record<string, unknown> }
  volumes?: string[]
  ports?: (string | PortObject)[]
  profiles?: string[]
  command?: string[]
  environment?: Record<string, unknown>
  healthcheck?: { test: string[] }
}
const compose = (path: string) =>
  Bun.YAML.parse(read(path)) as { services: Record<string, Service> }

test("docker-compose.yml builds every app from its Dockerfile, on its port", () => {
  const { services } = compose("docker-compose.yml")
  for (const [app, port] of Object.entries(SERVICES)) {
    expect(services[app], `docker-compose.yml has no ${app} service`).toBeDefined()
    const build = services[app]?.build
    expect(build?.dockerfile).toBe(
      isNext(app) ? "docker/next.Dockerfile" : "docker/bun-service.Dockerfile"
    )
    expect(build?.args.APP).toBe(app)
    expect(Number(build?.args.PORT)).toBe(port)
  }
})

test("the worker profile runs the api image's bundled worker, health-checked on its own port", () => {
  const { services } = compose("docker-compose.yml")
  const worker = services["api-worker"]
  expect(worker?.profiles).toEqual(["worker"])
  // It reuses the image the api service builds and tags, rather than building a second copy.
  expect(services.api?.image).toBeDefined()
  expect(worker?.image).toBe(services.api?.image as string)
  expect(worker?.build).toBeUndefined()
  expect(worker?.pull_policy).toBe("never")
  // The runner image holds only apps/api/dist: the command must name a file the build emits.
  const [, file] = worker?.command ?? []
  const entry = file?.replace(/^dist\/(.*)\.js$/, "./src/$1.ts")
  const pkg = JSON.parse(read("apps/api/package.json")) as { scripts: Record<string, string> }
  const buildScript = pkg.scripts.build ?? ""
  expect(entry && buildScript.split(" ")).toContain(entry)
  // src/worker.ts binds PORT like the api; its own port keeps it apart, and it serves no /ready.
  expect(worker?.environment?.PORT).toBeDefined()
  expect(Number(worker?.environment?.PORT)).not.toBe(SERVICES.api)
  expect(worker?.healthcheck?.test.join(" ")).toContain("/health")
  expect(worker?.volumes).toEqual(services.api?.volumes)
})

test("docker-compose.dev.yml keeps a container-only node_modules for every workspace", () => {
  const volumes = new Set(compose("docker-compose.dev.yml").services.dev?.volumes)
  expect(volumes.has("/app/node_modules")).toBe(true)
  for (const dir of ["apps", "packages"]) {
    for (const name of workspaces(dir))
      expect(volumes.has(`/app/${dir}/${name}/node_modules`)).toBe(true)
  }
  // The host's .next caches embed host absolute paths, so each Next app gets its own too.
  for (const app of workspaces("apps").filter(isNext)) {
    expect(volumes.has(`/app/apps/${app}/.next`)).toBe(true)
  }
})

test("the dev stack publishes every app's port and Storybook's on the host", () => {
  // `3000-3008:3000-3008` style ranges: a new app on 3009 would otherwise be unreachable.
  const published = (compose("docker-compose.dev.yml").services.dev?.ports ?? []).flatMap(
    (entry) => {
      const spec =
        typeof entry === "string" ? (entry.split(":")[0] ?? entry) : String(entry.published ?? "")
      const parts = spec.split("-").map(Number)
      const from = parts[0] ?? 0
      const to = parts[1] ?? from
      return Array.from({ length: to - from + 1 }, (_, k) => from + k)
    }
  )
  for (const port of [...Object.values(SERVICES), 6006]) expect(published).toContain(port)
})

test("the devcontainer forwards every app's port, Storybook's and Mailpit's", () => {
  const devcontainer = Bun.JSONC.parse(read(".devcontainer/devcontainer.json")) as {
    forwardPorts: (number | string)[]
  }
  for (const port of [...Object.values(SERVICES), 6006]) {
    expect(devcontainer.forwardPorts).toContain(port)
  }
  // Mailpit is its own compose service, so its forward names the service, not the dev container.
  expect(devcontainer.forwardPorts).toContain("mailpit:8025")
})

const isLoopback = (entry: string | PortObject) =>
  typeof entry === "string" ? entry.startsWith("127.0.0.1:") : entry.host_ip === "127.0.0.1"

test("a ports entry is loopback-bound in either syntax", () => {
  expect(isLoopback("127.0.0.1:3000:3000")).toBe(true)
  expect(isLoopback("3000:3000")).toBe(false)
  expect(isLoopback({ target: 3000, published: 3000, host_ip: "127.0.0.1" })).toBe(true)
  expect(isLoopback({ target: 3000, published: 3000 })).toBe(false)
})

test("every port docker-compose.yml publishes is bound to loopback", () => {
  const { services } = compose("docker-compose.yml")
  for (const [name, service] of Object.entries(services)) {
    for (const entry of service.ports ?? []) {
      expect(
        isLoopback(entry),
        `${name}'s port ${JSON.stringify(entry)} is not loopback-bound`
      ).toBe(true)
    }
  }
})

test("the GHCR publish workflow builds every app, on its port", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/docker-build.yml.disabled")) as {
    jobs: { build: { strategy: { matrix: { include: { app: string; port: number }[] } } } }
  }
  const rows = workflow.jobs.build.strategy.matrix.include
  expect(Object.fromEntries(rows.map((r) => [r.app, r.port]))).toEqual(SERVICES)
})
