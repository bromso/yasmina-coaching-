import { startServiceWorker } from "@repo/ui/lib/service-worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Pages here show the signed-in user: pages, navigation payloads and API calls are never cached.
// The rules live in @repo/ui/lib/service-worker-rules; @serwist/next injects the precache list here.
startServiceWorker("private", self.__SW_MANIFEST)
