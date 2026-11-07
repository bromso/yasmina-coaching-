import type { TelemetryProvider } from "./provider"

export const storeProvider: TelemetryProvider = { kind: "store", onNewError: async () => {} }
