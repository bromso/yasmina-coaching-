import { expect, test } from "bun:test"
import { appTranslator } from "./i18n"
import { parseNoteForm } from "./note-form"

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

test("a valid note is trimmed and accepted, with its workspace", () => {
  expect(parseNoteForm(form({ workspaceId: "7", title: "  Groceries ", body: "Milk" }))).toEqual({
    ok: true,
    note: { workspaceId: 7, title: "Groceries", body: "Milk" },
  })
})

test("a missing body is an empty body", () => {
  expect(parseNoteForm(form({ workspaceId: "7", title: "Title only" }))).toEqual({
    ok: true,
    note: { workspaceId: 7, title: "Title only", body: "" },
  })
})

test("a missing or malformed workspace id is refused and the typed values are kept", () => {
  const cases: Record<string, string>[] = [
    {},
    { workspaceId: "" },
    { workspaceId: "abc" },
    { workspaceId: "0" },
  ]
  for (const fields of cases) {
    expect(parseNoteForm(form({ ...fields, title: "Kept", body: "Also kept" }))).toEqual({
      ok: false,
      message: "Reload the page and try again",
      values: { title: "Kept", body: "Also kept" },
    })
  }
})

test("a whitespace-only title is rejected and the typed values are kept", () => {
  expect(parseNoteForm(form({ workspaceId: "7", title: "   ", body: "Keep me" }))).toEqual({
    ok: false,
    message: "Title is required",
    values: { title: "", body: "Keep me" },
  })
})

test("an over-long title names the limit", () => {
  const result = parseNoteForm(form({ workspaceId: "7", title: "x".repeat(201) }))
  expect(result).toMatchObject({ ok: false, message: "Title must be at most 200 characters" })
})

test("an over-long body names the limit and keeps the body", () => {
  const body = "y".repeat(10_001)
  const result = parseNoteForm(form({ workspaceId: "7", title: "Ok", body }))
  expect(result).toEqual({
    ok: false,
    message: "Body must be at most 10000 characters",
    values: { title: "Ok", body },
  })
})

test("in Swedish: the messages come from the app catalog", () => {
  const t = appTranslator("sv")
  expect(parseNoteForm(form({ workspaceId: "7", title: "   " }), t)).toMatchObject({
    ok: false,
    message: "Titeln måste fyllas i",
  })
  expect(parseNoteForm(form({ workspaceId: "x", title: "Ok" }), t)).toMatchObject({
    message: "Ladda om sidan och försök igen",
  })
})
