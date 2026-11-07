import { startServiceWorker } from "@repo/ui/lib/service-worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Every page is public: pages are network-first and readable offline once visited.
// The rules live in @repo/ui/lib/service-worker-rules; @serwist/next injects the precache list here.
startServiceWorker("public", self.__SW_MANIFEST)
