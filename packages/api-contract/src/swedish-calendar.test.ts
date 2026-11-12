import { describe, expect, test } from "bun:test"
import { isSwedishNonWorkingDay, shiftDay, swedishHolidays } from "./swedish-calendar"

describe("swedishHolidays", () => {
  test("2026", () => {
    expect(swedishHolidays(2026)).toEqual([
      "2026-01-01", // nyårsdagen
      "2026-01-06", // trettondedag jul
      "2026-04-03", // långfredagen
      "2026-04-05", // påskdagen
      "2026-04-06", // annandag påsk
      "2026-05-01", // första maj
      "2026-05-14", // Kristi himmelsfärdsdag
      "2026-05-24", // pingstdagen
      "2026-06-06", // nationaldagen
      "2026-06-19", // midsommarafton
      "2026-06-20", // midsommardagen
      "2026-10-31", // alla helgons dag
      "2026-12-24", // julafton
      "2026-12-25", // juldagen
      "2026-12-26", // annandag jul
      "2026-12-31", // nyårsafton
    ])
  })

  test("2027", () => {
    expect(swedishHolidays(2027)).toEqual([
      "2027-01-01",
      "2027-01-06",
      "2027-03-26", // långfredagen
      "2027-03-28", // påskdagen
      "2027-03-29", // annandag påsk
      "2027-05-01",
      "2027-05-06", // Kristi himmelsfärdsdag
      "2027-05-16", // pingstdagen
      "2027-06-06",
      "2027-06-25", // midsommarafton
      "2027-06-26", // midsommardagen
      "2027-11-06", // alla helgons dag
      "2027-12-24",
      "2027-12-25",
      "2027-12-26",
      "2027-12-31",
    ])
  })
})

describe("isSwedishNonWorkingDay", () => {
  test("weekends and holidays are not working days; an ordinary weekday is", () => {
    expect(isSwedishNonWorkingDay("2026-11-14")).toBe(true) // Saturday
    expect(isSwedishNonWorkingDay("2026-11-15")).toBe(true) // Sunday
    expect(isSwedishNonWorkingDay("2026-06-19")).toBe(true) // midsommarafton, a Friday
    expect(isSwedishNonWorkingDay("2027-05-06")).toBe(true) // Kristi himmelsfärd, a Thursday
    expect(isSwedishNonWorkingDay("2026-11-16")).toBe(false) // Monday
    expect(isSwedishNonWorkingDay("2026-12-23")).toBe(false) // the day before julafton
  })
})

test("shiftDay crosses months, years and DST changes by calendar day", () => {
  expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01")
  expect(shiftDay("2026-03-20", 14)).toBe("2026-04-03")
  expect(shiftDay("2026-10-20", 14)).toBe("2026-11-03")
})
