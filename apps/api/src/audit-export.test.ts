import { describe, expect, test } from "bun:test"
import {
  AUDIT_EXPORT_COLUMNS,
  AUDIT_EXPORT_MAX_ROWS,
  auditExportRange,
  guardCell,
  isToWithinBounds,
  toCsv,
  toJsonl,
} from "./audit-export"
import type { AuditDetailRow } from "./queries/audit"

const BOM = "﻿"
const CRLF = "\r\n"

/** A minimal RFC 4180 record splitter (quote-aware, doubled-quote-aware) — enough to prove a
 * comma embedded in one quoted field was not mistaken for a field separator. */
function splitCsvRecord(line: string): string[] {
  const cells: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] !== '"') throw new Error(`expected a quoted field at ${i}: ${line.slice(i)}`)
    i++
    let value = ""
    while (i < line.length) {
      if (line[i] === '"' && line[i + 1] === '"') {
        value += '"'
        i += 2
      } else if (line[i] === '"') {
        i++
        break
      } else {
        value += line[i]
        i++
      }
    }
    cells.push(value)
    if (line[i] === ",") i++
  }
  return cells
}

function row(overrides: Partial<AuditDetailRow> = {}): AuditDetailRow {
  return {
    id: 1,
    at: "2026-10-18T12:00:00.000Z",
    actor_user_id: 7,
    impersonated_user_id: null,
    action: "user.suspended",
    target_type: "user",
    target_id: "42",
    reason: "testing",
    ip: "203.0.113.7",
    user_agent: "TestAgent/1",
    metadata: '{"until":null}',
    workspace_id: null,
    actor_email: "admin@example.com",
    impersonated_email: null,
    ...overrides,
  }
}

describe("guardCell", () => {
  test("leaves an ordinary value unchanged", () => {
    expect(guardCell("hello")).toBe("hello")
  })
  test("leaves an empty value unchanged", () => {
    expect(guardCell("")).toBe("")
  })
  for (const leading of ["=", "+", "-", "@", "\t", "\r"]) {
    test(`guards a value starting with ${JSON.stringify(leading)}`, () => {
      expect(guardCell(`${leading}cmd`)).toBe(`'${leading}cmd`)
    })
  }
  test("guards a value that is just a lone leading character", () => {
    expect(guardCell("-")).toBe("'-")
    expect(guardCell("=")).toBe("'=")
  })
  test("does not guard a character appearing later in the value", () => {
    expect(guardCell("a-b")).toBe("a-b")
    expect(guardCell("a=b")).toBe("a=b")
  })
})

describe("toCsv", () => {
  test("starts with a UTF-8 BOM and a quoted header row ending in CRLF", () => {
    const csv = toCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
    const header = csv.slice(BOM.length, csv.indexOf(CRLF))
    expect(header).toBe(
      [
        "id",
        "at",
        "actor_id",
        "actor_email",
        "impersonated_id",
        "impersonated_email",
        "action",
        "target_type",
        "target_id",
        "reason",
        "ip",
        "user_agent",
        "metadata",
      ]
        .map((c) => `"${c}"`)
        .join(",")
    )
  })

  test("every field is quoted and every line ends with CRLF", () => {
    const csv = toCsv([row()])
    const lines = csv.slice(BOM.length).split(CRLF).filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(csv.endsWith(CRLF)).toBe(true)
    for (const cell of lines[1]?.split(",") ?? []) {
      expect(cell.startsWith('"')).toBe(true)
      expect(cell.endsWith('"')).toBe(true)
    }
  })

  test("doubles an embedded quote", () => {
    const csv = toCsv([row({ reason: 'he said "hi"' })])
    const line = csv.slice(BOM.length).split(CRLF)[1]
    expect(line).toContain('"he said ""hi"""')
  })

  test("keeps a comma inside a quoted field as one field", () => {
    const csv = toCsv([row({ reason: "a, b, c" })])
    const line = csv.slice(BOM.length).split(CRLF)[1] ?? ""
    expect(line).toContain('"a, b, c"')
    // A quote-aware split (not a naive comma split, which would overcount) proves the comma
    // inside the quoted reason did not turn into extra cells.
    expect(splitCsvRecord(line)).toHaveLength(13)
  })

  test("keeps a newline inside a value, embedded in the quoted field", () => {
    const csv = toCsv([row({ reason: "line one\nline two" })])
    expect(csv).toContain('"line one\nline two"')
  })

  test("a null field renders as an empty quoted cell", () => {
    const csv = toCsv([
      row({
        actor_user_id: null,
        actor_email: null,
        impersonated_user_id: null,
        impersonated_email: null,
        target_type: null,
        target_id: null,
        reason: null,
        ip: null,
        user_agent: null,
        metadata: null,
      }),
    ])
    const line = csv.slice(BOM.length).split(CRLF)[1]
    // id, at, action are never null; every other column here is — expect an empty cell for each.
    expect(line).toBe(
      [
        '"1"',
        '"2026-10-18T12:00:00.000Z"',
        '""',
        '""',
        '""',
        '""',
        '"user.suspended"',
        '""',
        '""',
        '""',
        '""',
        '""',
        '""',
      ].join(",")
    )
  })

  test("a value starting with a formula-guarded character is quoted and prefixed with '", () => {
    const csv = toCsv([row({ reason: "=SUM(A1:A9)" })])
    expect(csv).toContain(`"'=SUM(A1:A9)"`)
  })

  test("a value that is just a lone '-' is guarded even when quoted", () => {
    const csv = toCsv([row({ target_id: "-" })])
    expect(csv).toContain(`"'-"`)
  })

  test("metadata is emitted as the raw stored JSON text, not re-encoded", () => {
    const csv = toCsv([row({ metadata: '{"from":"2026-01-01","rows":3}' })])
    expect(csv).toContain('"{""from"":""2026-01-01"",""rows"":3}"')
  })
})

describe("toJsonl", () => {
  test("one JSON object per line, in the design's column order", () => {
    const jsonl = toJsonl([row()])
    const lines = jsonl.split("\n").filter(Boolean)
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0] ?? "")
    expect(parsed).toEqual({
      id: 1,
      at: "2026-10-18T12:00:00.000Z",
      actor_id: 7,
      actor_email: "admin@example.com",
      impersonated_id: null,
      impersonated_email: null,
      action: "user.suspended",
      target_type: "user",
      target_id: "42",
      reason: "testing",
      ip: "203.0.113.7",
      user_agent: "TestAgent/1",
      metadata: { until: null },
    })
    // `toEqual` ignores key order, so it alone cannot catch the keys coming out in the wrong
    // order — this can.
    expect(Object.keys(parsed)).toEqual([...AUDIT_EXPORT_COLUMNS])
  })

  test("null metadata stays null", () => {
    const parsed = JSON.parse(toJsonl([row({ metadata: null })]).trim())
    expect(parsed.metadata).toBeNull()
  })

  test("metadata that is not valid JSON stays as the raw string", () => {
    const parsed = JSON.parse(toJsonl([row({ metadata: "not json at all" })]).trim())
    expect(parsed.metadata).toBe("not json at all")
  })

  test("no trailing newline for an empty row set", () => {
    expect(toJsonl([])).toBe("")
  })

  test("ends with exactly one trailing newline per row, none extra", () => {
    const jsonl = toJsonl([row({ id: 1 }), row({ id: 2 })])
    expect(jsonl.endsWith("\n")).toBe(true)
    expect(jsonl.split("\n").filter(Boolean)).toHaveLength(2)
  })
})

describe("auditExportRange", () => {
  test("from's own midnight to the midnight after to's day", () => {
    expect(auditExportRange("2026-10-18", "2026-10-18")).toEqual({
      fromIso: "2026-10-18T00:00:00.000Z",
      toExclusiveIso: "2026-10-19T00:00:00.000Z",
    })
  })
  test("crosses a month/leap-day boundary correctly", () => {
    expect(auditExportRange("2024-02-01", "2024-02-28")).toEqual({
      fromIso: "2024-02-01T00:00:00.000Z",
      toExclusiveIso: "2024-02-29T00:00:00.000Z",
    })
  })
  test("crosses a year boundary correctly", () => {
    expect(auditExportRange("2025-12-01", "2025-12-31")).toEqual({
      fromIso: "2025-12-01T00:00:00.000Z",
      toExclusiveIso: "2026-01-01T00:00:00.000Z",
    })
  })
})

describe("isToWithinBounds", () => {
  const now = new Date("2026-10-18T15:00:00.000Z")
  test("today is within bounds", () => {
    expect(isToWithinBounds("2026-10-18", now)).toBe(true)
  })
  test("tomorrow (today + 1) is within bounds — an admin's local date may already be there", () => {
    expect(isToWithinBounds("2026-10-19", now)).toBe(true)
  })
  test("the day after tomorrow is refused", () => {
    expect(isToWithinBounds("2026-10-20", now)).toBe(false)
  })
  test("any day in the past is within bounds", () => {
    expect(isToWithinBounds("2020-01-01", now)).toBe(true)
  })
  test("crosses a year boundary correctly", () => {
    const newYearsEve = new Date("2025-12-31T23:00:00.000Z")
    expect(isToWithinBounds("2026-01-01", newYearsEve)).toBe(true)
    expect(isToWithinBounds("2026-01-02", newYearsEve)).toBe(false)
  })
})

test("AUDIT_EXPORT_MAX_ROWS is the documented default cap", () => {
  expect(AUDIT_EXPORT_MAX_ROWS).toBe(100_000)
})
