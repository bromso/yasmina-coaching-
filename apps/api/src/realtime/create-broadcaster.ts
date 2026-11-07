import { SQL } from "bun"
import type { Log } from "../jobs/define"
import type { Broadcaster } from "./broadcaster"
import { memoryBroadcaster } from "./memory"
import { postgresBroadcaster } from "./postgres"

/**
 * The Postgres broadcaster's own client. `new SQL(url)` is a pool (up to 10 connections by
 * default); `max: 1` keeps it to one, which carries every NOTIFY. `sql.listen` opens one more
 * dedicated connection outside the pool for the LISTEN, so a replica holds exactly two extra
 * connections for realtime (verified against Postgres 16 on Bun 1.4.2).
 */
export const broadcasterSql = (databaseUrl: string) => new SQL(databaseUrl, { max: 1 })

/**
 * Builds the broadcaster `createServer` uses. `memory` needs nothing; `postgres` opens its own
 * client (`broadcasterSql`: one LISTEN connection, one for NOTIFY), never the api's database pool.
 */
export function createBroadcaster(opts: {
  bus: "memory" | "postgres"
  databaseUrl: string
  log: Log
}): Promise<Broadcaster> {
  if (opts.bus === "memory") return Promise.resolve(memoryBroadcaster(opts.log))
  return postgresBroadcaster(broadcasterSql(opts.databaseUrl), opts.log)
}
