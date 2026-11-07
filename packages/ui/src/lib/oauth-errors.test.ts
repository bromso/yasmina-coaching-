import { expect, test } from "bun:test"
import { oauthErrorMessage } from "./oauth-errors"

test("known codes name the provider; unknown codes and none show nothing", () => {
  expect(oauthErrorMessage("claimed", "GitHub")).toBe(
    "That GitHub account is already connected to another user, or you already have one connected — disconnect it first."
  )
  expect(oauthErrorMessage("provider", "Google")).toContain("Google is not responding")
  expect(oauthErrorMessage("unverified", "Google")).toBe(
    "Your Google account's email is not verified — sign in with your email first, then connect Google in your account."
  )
  expect(oauthErrorMessage("unverified", undefined)).toContain(
    "connect the provider in your account"
  )
  expect(oauthErrorMessage("provider", undefined)).toContain("The provider is not responding")
  expect(oauthErrorMessage("state", undefined)).toContain("expired")
  expect(oauthErrorMessage("constructor", "toString")).toBeUndefined()
  expect(oauthErrorMessage(undefined, "Google")).toBeUndefined()
})
