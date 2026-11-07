import { describe, expect, test } from "bun:test"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { renderToStaticMarkup } from "react-dom/server"
import { UserMenu, UserMenuItems, type UserMenuProps } from "./user-menu"

const signOut = async () => {}

describe("UserMenu", () => {
  test("renders a menu trigger button with initials and an sr-only label", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{ name: "Ada Lovelace", email: "ada@example.com" }}
        accountUrl="https://account.example.com"
        signOut={signOut}
      />
    )
    expect(html).toMatch(/^<button [^>]*aria-haspopup="menu"/)
    expect(html).toContain(">AL<")
    // The avatar is decorative: the sr-only span alone names the trigger.
    expect(html).toMatch(
      /<span [^>]*data-slot="avatar"[^>]*aria-hidden="true"|<span [^>]*aria-hidden="true"[^>]*data-slot="avatar"/
    )
    expect(html).toContain('<span class="sr-only">Account menu for Ada Lovelace</span>')
    // The closed menu renders only its trigger: name/email live in the dropdown content.
    expect(html).not.toContain("ada@example.com")
    expect(html).not.toContain("Sign out")
  })

  test("falls back to the email when the user has no name", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{ name: "", email: "zoe@example.com" }}
        accountUrl="https://account.example.com"
        signOut={signOut}
      />
    )
    expect(html).toContain(">Z<")
    expect(html).toContain("Account menu for zoe@example.com")
  })

  test("renders an img for the trigger avatar when avatarUrl is set", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{
          name: "Ada Lovelace",
          email: "ada@example.com",
          avatarUrl: "https://cdn.example.com/ada.png",
        }}
        accountUrl="https://account.example.com"
        signOut={signOut}
      />
    )
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn\.example\.com\/ada\.png"[^>]*alt=""/)
    expect(html).not.toContain(">AL<")
    // The avatar is still decorative; only the sr-only span names the trigger.
    expect(html).toContain('<span class="sr-only">Account menu for Ada Lovelace</span>')
  })

  test("falls back to initials in the trigger when there is no avatarUrl", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{ name: "Ada Lovelace", email: "ada@example.com" }}
        accountUrl="https://account.example.com"
        signOut={signOut}
      />
    )
    expect(html).not.toContain("<img")
    expect(html).toContain(">AL<")
  })

  test("note is appended to the label", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{ name: "Ada Lovelace", email: "ada@example.com" }}
        accountUrl="https://account.example.com"
        signOut={signOut}
        note="(impersonating)"
      />
    )
    expect(html).toContain("Account menu for Ada Lovelace (impersonating)")
  })
})

const switchTo = async (_formData: FormData) => {}
const workspaces = {
  items: [
    { id: 1, name: "Acme" },
    { id: 2, name: "Globex" },
  ],
  currentId: 2,
  switchTo,
  pendingInvitations: 0,
  newUrl: "https://app.example.com/workspaces/new",
  manageUrl: "https://account.example.com/workspace",
  canManage: false,
}
const user = { name: "Ada Lovelace", email: "ada@example.com" }

/** The open menu's items, rendered without the portal (which SSR never mounts). */
function renderItems(props: Partial<UserMenuProps> = {}) {
  return renderToStaticMarkup(
    <DropdownMenuPrimitive.Root open>
      <DropdownMenuPrimitive.Content>
        <UserMenuItems
          user={user}
          accountUrl="https://account.example.com"
          signOut={signOut}
          {...props}
        />
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Root>
  )
}

describe("UserMenuItems", () => {
  test("without workspaces: label, Account, Sign out and nothing else", () => {
    const html = renderItems()
    expect(html).toContain("ada@example.com")
    expect(html).toContain(">Account</a>")
    expect(html).toContain("Sign out")
    expect(html).not.toContain("Workspace")
    expect(html).not.toContain("workspaceId")
    expect(html.match(/role="menuitem"/g)).toHaveLength(2)
  })

  test("lists the workspaces, each a form posting its id, and marks the current one", () => {
    const html = renderItems({ workspaces })
    expect(html).toContain(">Workspace<")
    expect(html).toContain('name="workspaceId" value="1"')
    expect(html).toContain('name="workspaceId" value="2"')
    expect(html).toMatch(/<button [^>]*aria-current="true"[^>]*>[\s\S]*?<span[^>]*>Globex<\/span>/)
    expect(html).not.toMatch(/aria-current="true"[^>]*>[\s\S]*?<span[^>]*>Acme</)
    expect(html.match(/aria-current=/g)).toHaveLength(1)
    expect(html).toMatch(
      /<a href="https:\/\/app\.example\.com\/workspaces\/new"[^>]*>Create a workspace<\/a>/
    )
    expect(html).not.toContain("Manage members")
    expect(html).not.toContain("Invitations")
    expect(html).not.toContain("No workspace yet")
  })

  test("workspace items show a logo image when present, a letter tile otherwise", () => {
    const html = renderItems({
      workspaces: {
        ...workspaces,
        items: [
          { id: 1, name: "Acme", logoUrl: "https://cdn.example.com/acme.png" },
          { id: 2, name: "Globex" },
        ],
      },
    })
    expect(html).toMatch(
      /<img[^>]*src="https:\/\/cdn\.example\.com\/acme\.png"[^>]*width="16"[^>]*height="16"[^>]*alt=""/
    )
    expect(html).toMatch(/<span[^>]*>G<\/span>/)
  })

  test("canManage shows Manage members", () => {
    const html = renderItems({ workspaces: { ...workspaces, canManage: true } })
    expect(html).toMatch(
      /<a href="https:\/\/account\.example\.com\/workspace"[^>]*>Manage members<\/a>/
    )
  })

  test("pending invitations show a counted Invitations item", () => {
    const html = renderItems({ workspaces: { ...workspaces, pendingInvitations: 3 } })
    expect(html).toMatch(/>Invitations <span [^>]*data-slot="badge"[^>]*>3<\/span><\/a>/)
  })

  test("no workspaces yet: a disabled hint, and Create a workspace", () => {
    const html = renderItems({ workspaces: { ...workspaces, items: [], currentId: null } })
    expect(html).toContain("No workspace yet")
    expect(html).toContain("Create a workspace")
  })
})

describe("UserMenu trigger with workspaces", () => {
  test("announces pending invitations in the trigger's label", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={user}
        accountUrl="https://account.example.com"
        signOut={signOut}
        workspaces={{ ...workspaces, pendingInvitations: 1 }}
      />
    )
    expect(html).toContain("Account menu for Ada Lovelace, 1 pending invitation<")
  })

  test("keeps the plain label without pending invitations", () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={user}
        accountUrl="https://account.example.com"
        signOut={signOut}
        workspaces={workspaces}
      />
    )
    expect(html).toContain('<span class="sr-only">Account menu for Ada Lovelace</span>')
  })
})
