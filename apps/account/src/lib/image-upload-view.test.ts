import { describe, expect, test } from "bun:test"
import { resolveImageUploadView } from "./image-upload-view"

describe("resolveImageUploadView", () => {
  test("a local preview wins over the persisted url", () => {
    expect(
      resolveImageUploadView({ url: "/files/avatars/1/old.png", preview: "blob:new" })
    ).toEqual({ shown: "blob:new", showRemove: true })
  })

  test("no preview falls back to the persisted url", () => {
    expect(resolveImageUploadView({ url: "/files/avatars/1/old.png", preview: null })).toEqual({
      shown: "/files/avatars/1/old.png",
      showRemove: true,
    })
  })

  test("neither set: nothing to show, no remove control", () => {
    expect(resolveImageUploadView({ url: null, preview: null })).toEqual({
      shown: null,
      showRemove: false,
    })
  })

  test("showRemove tracks only `url`, never the local preview", () => {
    // Choosing a file before ever uploading one must not reveal Remove — there is nothing to remove.
    expect(resolveImageUploadView({ url: null, preview: "blob:picked" })).toEqual({
      shown: "blob:picked",
      showRemove: false,
    })
  })

  test("a just-removed image: url already cleared, no preview — falls back to the initials fallback", () => {
    // The render right after a successful remove: the server round trip cleared `url`, and there is
    // no local preview (the Remove form has no file input to have set one). `showRemove` following
    // `url` to false here is exactly why the remove message can't live inside `{showRemove && ...}`
    // — ImageUploadCard renders that message unconditionally instead (see this module's docstring).
    expect(resolveImageUploadView({ url: null, preview: null })).toEqual({
      shown: null,
      showRemove: false,
    })
  })
})
