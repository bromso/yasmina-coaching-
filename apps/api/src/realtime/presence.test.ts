import { describe, expect, test } from "bun:test"
import { createPresence } from "./presence"

const ada = { userId: 1, name: "Ada", avatarUrl: null }
const bob = { userId: 2, name: "Bob", avatarUrl: "/files/bob.png" }

describe("createPresence", () => {
  test("two connections of one user are one member; join and leave report only the edges", () => {
    const presence = createPresence()
    expect(presence.join(10, ada, "c1")).toBe(true)
    expect(presence.join(10, ada, "c2")).toBe(false)
    expect(presence.members(10)).toEqual([ada])

    expect(presence.leave(10, ada.userId, "c1")).toBe(false)
    expect(presence.members(10)).toEqual([ada])
    expect(presence.leave(10, ada.userId, "c2")).toBe(true)
    expect(presence.members(10)).toEqual([])
    expect(presence.workspaces()).toEqual([])
  })

  test("two users are two members, per workspace", () => {
    const presence = createPresence()
    presence.join(10, ada, "c1")
    presence.join(10, bob, "c2")
    presence.join(11, bob, "c3")
    expect(presence.members(10)).toEqual([ada, bob])
    expect(presence.members(11)).toEqual([bob])
    expect(presence.workspaces().sort()).toEqual([10, 11])
  })

  test("leaving with an unknown connection changes nothing", () => {
    const presence = createPresence()
    presence.join(10, ada, "c1")
    expect(presence.leave(10, ada.userId, "nope")).toBe(false)
    expect(presence.leave(99, ada.userId, "c1")).toBe(false)
    expect(presence.members(10)).toEqual([ada])
  })

  test("the newest connection's name wins", () => {
    const presence = createPresence()
    presence.join(10, ada, "c1")
    presence.join(10, { ...ada, name: "Ada L." }, "c2")
    expect(presence.members(10)).toEqual([{ ...ada, name: "Ada L." }])
  })
})
