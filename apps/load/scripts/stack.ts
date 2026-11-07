/**
 * `bun run --filter @repo/load stack [--db sqlite|postgres] [--api-port N] [--ai-port N]`: starts
 * apps/api and apps/ai with load-test settings and keeps them up until Ctrl-C. Prints the env a
 * scenario run in another terminal needs to target them.
 */
import { DEFAULT_PORTS, startStack } from "../src/stack"

export { startStack } from "../src/stack"

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

if (import.meta.main) {
  const db = arg("db") ?? "sqlite"
  if (db !== "sqlite" && db !== "postgres") throw new Error(`--db must be sqlite or postgres`)
  const stack = await startStack({
    db,
    apiPort: Number(arg("api-port") ?? DEFAULT_PORTS.api),
    aiPort: Number(arg("ai-port") ?? DEFAULT_PORTS.ai),
  })
  console.log(`api ${stack.apiUrl} · ai ${stack.aiUrl} · log ${stack.logPath}`)
  console.log("In another terminal:")
  console.log(`  export LOAD_TARGET_API=${stack.apiUrl} LOAD_TARGET_AI=${stack.aiUrl}`)
  console.log(`  export API_SERVICE_TOKEN=${stack.target.apiToken}`)
  console.log(`  export AI_SERVICE_TOKEN=${stack.target.aiToken}`)
  console.log(`  export LOAD_MAIL_DIR=${stack.mailDir} METRICS_TOKEN=${stack.metricsToken}`)
  console.log("Ctrl-C stops both.")
  const shutdown = async () => {
    await stack.stop()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
