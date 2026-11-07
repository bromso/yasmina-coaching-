import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SITES } from "../packages/sites/src/index"

// The editor config drifts silently: nothing runs it in CI. These tests pin it to the repo.
const ROOT = join(import.meta.dir, "..")
const jsonc = (path: string) => Bun.JSONC.parse(readFileSync(join(ROOT, path), "utf8"))
const workspaces = (dir: string) =>
  readdirSync(join(ROOT, dir)).filter((name) => existsSync(join(ROOT, dir, name, "package.json")))
const devScript = (app: string): string | undefined =>
  JSON.parse(readFileSync(join(ROOT, "apps", app, "package.json"), "utf8")).scripts?.dev

type Config = {
  name: string
  type: string
  cwd?: string
  url?: string
  webRoot?: string
  program?: string
  command?: string
  serverReadyAction?: { pattern: string; name?: string }
}
const launch = jsonc(".vscode/launch.json") as {
  configurations: Config[]
  compounds: { name: string; configurations: string[] }[]
}
// biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code's own variable, a literal string here
const WORKSPACE_FOLDER = "${workspaceFolder}"
const resolve = (path: string) => path.replace(WORKSPACE_FOLDER, ROOT)

describe(".vscode/launch.json", () => {
  test("every app with a dev script has a launch config running in its folder", () => {
    const cwds = new Set(launch.configurations.map((c) => c.cwd && resolve(c.cwd)))
    for (const app of workspaces("apps").filter((a) => devScript(a))) {
      expect(cwds.has(join(ROOT, "apps", app))).toBe(true)
    }
  })

  test("every cwd and program exists", () => {
    // `${file}` / `${fileWorkspaceFolder}` resolve only in the editor; check the fixed paths.
    for (const c of launch.configurations.filter((c) => c.cwd?.startsWith(WORKSPACE_FOLDER))) {
      expect(existsSync(resolve(c.cwd as string))).toBe(true)
      if (c.program) expect(existsSync(join(resolve(c.cwd as string), c.program))).toBe(true)
    }
  })

  test("each Next app's browser config opens the host and port its dev script binds", () => {
    for (const [id, site] of Object.entries(SITES)) {
      const url = `http://${id}.brand.localhost:${site.port}`
      const dev = devScript(id) ?? ""
      expect(dev).toContain(`${id}.brand.localhost`)
      // next dev defaults to 3000; every other app names its port.
      if (site.port !== 3000) expect(dev).toContain(`--port ${site.port}`)
      const chrome = launch.configurations.filter((c) => c.type === "chrome" && c.url === url)
      expect(chrome).toHaveLength(1)
    }
  })

  test("each Next server opens its own browser config, on its own folder", () => {
    const byName = new Map(launch.configurations.map((c) => [c.name, c]))
    for (const [id, site] of Object.entries(SITES)) {
      const server = launch.configurations.find((c) => c.cwd === `${WORKSPACE_FOLDER}/apps/${id}`)
      expect(server?.type).toBe("node-terminal")
      expect(server?.command).toBe("bun run dev")
      const chrome = byName.get(server?.serverReadyAction?.name ?? "")
      expect(chrome?.url).toBe(`http://${id}.brand.localhost:${site.port}`)
      expect(chrome?.webRoot).toBe(`${WORKSPACE_FOLDER}/apps/${id}`)
    }
  })

  test("serverReadyAction patterns are distinct and name their app's port", () => {
    // VS Code matches every debug terminal's output against every waiting pattern: a shared
    // pattern ("Ready in") lets one app's readiness open another app's browser.
    const ready = launch.configurations.filter((c) => c.serverReadyAction)
    const patterns = ready.map((c) => c.serverReadyAction?.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)
    for (const c of ready) {
      const port = (
        launch.configurations.find((x) => x.name === c.serverReadyAction?.name)?.url ?? ""
      )
        .split(":")
        .at(-1)
      expect(port).toMatch(/^\d+$/)
      expect(c.serverReadyAction?.pattern).toContain(port as string)
    }
  })

  test("Storybook's browser config matches the port its dev script serves", () => {
    const port = devScript("story")?.match(/-p (\d+)/)?.[1]
    expect(port).toBeDefined()
    const chrome = launch.configurations.find((c) => c.name === "Chrome: Storybook")
    expect(chrome?.url).toBe(`http://localhost:${port}`)
  })

  test("the Bun service configs run what their dev scripts run", () => {
    for (const service of ["api", "ai"]) {
      const config = launch.configurations.find(
        (c) => c.type === "bun" && c.cwd === `${WORKSPACE_FOLDER}/apps/${service}`
      )
      expect(devScript(service)).toContain(`bun --hot ${config?.program}`)
    }
  })

  test("compounds name configs that exist", () => {
    const names = new Set(launch.configurations.map((c) => c.name))
    for (const compound of launch.compounds) {
      for (const name of compound.configurations) expect(names.has(name)).toBe(true)
    }
  })
})

test("the devcontainer installs every recommended extension", () => {
  const recommended = (jsonc(".vscode/extensions.json") as { recommendations: string[] })
    .recommendations
  const installed = (
    jsonc(".devcontainer/devcontainer.json") as {
      customizations: { vscode: { extensions: string[] } }
    }
  ).customizations.vscode.extensions
  // Remote-* extensions run on your machine (they open the container); nothing to install inside.
  for (const id of recommended.filter((r) => !r.startsWith("ms-vscode-remote."))) {
    expect(installed).toContain(id)
  }
})

test("the multi-root workspace lists every app and package as a folder", () => {
  const folders = new Set(
    (jsonc("workspace.code-workspace") as { folders: { path: string }[] }).folders.map((f) =>
      f.path.replace(/^\.\//, "")
    )
  )
  for (const dir of ["apps", "packages"]) {
    for (const name of workspaces(dir)) expect(folders.has(`${dir}/${name}`)).toBe(true)
  }
})

test("launch and task configs live only at the root", () => {
  for (const dir of ["apps", "packages"]) {
    for (const name of workspaces(dir)) {
      for (const file of ["launch.json", "tasks.json"]) {
        expect(existsSync(join(ROOT, dir, name, ".vscode", file))).toBe(false)
      }
    }
  }
})
