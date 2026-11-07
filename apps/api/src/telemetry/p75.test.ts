import { expect, test } from "bun:test"
import { vitalsByApp } from "./p75"

test("vitalsByApp folds per-metric p75 rows into one row per app, samples summed", () => {
  const rows = vitalsByApp([
    { app: "www", name: "INP", samples: 1, p75: 150 },
    { app: "app", name: "LCP", samples: 2, p75: 3000 },
    { app: "app", name: "CLS", samples: 1, p75: 0.2 },
  ])
  expect(rows).toEqual([
    { app: "app", samples: 3, lcp: 3000, inp: null, cls: 0.2 },
    { app: "www", samples: 1, lcp: null, inp: 150, cls: null },
  ])
})
