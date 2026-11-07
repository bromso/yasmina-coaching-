#!/usr/bin/env bun
/**
 * Doctor script - validates development environment setup
 * Run with: bun doctor
 */

interface CheckResult {
  ok: boolean
  message: string
}

interface Check {
  name: string
  check: () => Promise<CheckResult>
}

const checks: Check[] = [
  {
    name: "Bun version",
    check: async () => {
      const proc = Bun.spawn(["bun", "--version"])
      const text = await new Response(proc.stdout).text()
      const version = text.trim()
      const required = "1.1"
      const major = version.split(".")[0]
      const minor = version.split(".")[1]
      const isValid = Number(major) >= 1 && Number(minor) >= 1
      return isValid
        ? { ok: true, message: `v${version}` }
        : { ok: false, message: `Expected ${required}+, got ${version}` }
    },
  },
  {
    name: "Node modules installed",
    check: async () => {
      const biomePackage = Bun.file("node_modules/@biomejs/biome/package.json")
      const exists = await biomePackage.exists()
      return exists
        ? { ok: true, message: "Installed" }
        : { ok: false, message: "Run: bun install" }
    },
  },
  {
    name: "apps/app/.env.local",
    check: async () => {
      const envFile = Bun.file("apps/app/.env.local")
      const exists = await envFile.exists()
      return exists
        ? { ok: true, message: "Found" }
        : { ok: false, message: "Missing - copy from .env.example" }
    },
  },
  {
    name: "TypeScript config",
    check: async () => {
      const tsConfig = Bun.file("tsconfig.json")
      const exists = await tsConfig.exists()
      return exists
        ? { ok: true, message: "Found" }
        : { ok: false, message: "Missing tsconfig.json" }
    },
  },
  {
    name: "Bun workspaces",
    check: async () => {
      const rootPackage = Bun.file("package.json")
      if (!(await rootPackage.exists())) {
        return { ok: false, message: "Missing package.json" }
      }
      const { workspaces } = await rootPackage.json()
      return Array.isArray(workspaces) && workspaces.length > 0
        ? { ok: true, message: workspaces.join(", ") }
        : { ok: false, message: "Missing workspaces in package.json" }
    },
  },
  {
    name: "Biome config",
    check: async () => {
      const biomeConfig = Bun.file("biome.json")
      const exists = await biomeConfig.exists()
      return exists ? { ok: true, message: "Found" } : { ok: false, message: "Missing biome.json" }
    },
  },
  {
    name: "Git hooks (Husky)",
    check: async () => {
      const preCommit = Bun.file(".husky/pre-commit")
      const exists = await preCommit.exists()
      return exists
        ? { ok: true, message: "Configured" }
        : { ok: false, message: "Run: bun prepare" }
    },
  },
  {
    name: "UI package",
    check: async () => {
      const uiPackage = Bun.file("packages/ui/package.json")
      const exists = await uiPackage.exists()
      return exists
        ? { ok: true, message: "Found @repo/ui" }
        : { ok: false, message: "Missing packages/ui" }
    },
  },
]

async function runDoctor() {
  console.log("\n Boilerplate Doctor\n")
  console.log("Checking your development environment...\n")

  let allPassed = true

  for (const { name, check } of checks) {
    try {
      const result = await check()
      const icon = result.ok ? "\u2705" : "\u274C"
      console.log(`${icon} ${name}: ${result.message}`)
      if (!result.ok) allPassed = false
    } catch (error) {
      console.log(`\u274C ${name}: Error - ${error}`)
      allPassed = false
    }
  }

  console.log("")

  if (allPassed) {
    console.log("\u2728 All checks passed! You're ready to develop.\n")
    console.log("Quick commands:")
    console.log("  bun dev          - Start all apps")
    console.log("  bun story        - Start Storybook")
    console.log("  bun typecheck    - Run type checks")
    console.log("  bun lint         - Run linting\n")
  } else {
    console.log("\u26A0\uFE0F Some checks failed. Please fix the issues above.\n")
    process.exit(1)
  }
}

runDoctor()
