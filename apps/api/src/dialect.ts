import type { SQL } from "bun"

export type Dialect = "sqlite" | "postgres"

/** The engine Bun.sql chose from DATABASE_URL. Only SQLite and Postgres have tested DDL here. */
export function dialectOf(sql: Pick<SQL, "options">): Dialect {
  const adapter = sql.options.adapter
  if (adapter === "sqlite" || adapter === "postgres") return adapter
  throw new Error("Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://")
}

/** The one piece of DDL that differs between the two engines. */
export const ddl = {
  serialId: (dialect: Dialect) =>
    dialect === "sqlite"
      ? "INTEGER PRIMARY KEY AUTOINCREMENT"
      : "INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
}
