import { UserMenu } from "@repo/ui/components/user-menu"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Components/UserMenu",
  component: UserMenu,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    user: { name: "Ada Lovelace", email: "ada@example.com" },
    accountUrl: "https://account.brand.com",
    signOut: fn(async () => {}),
  },
} satisfies Meta<typeof UserMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Account menu for Ada Lovelace" }))
    const body = within(document.body)
    await expect(await body.findByRole("menuitem", { name: "Account" })).toHaveAttribute(
      "href",
      "https://account.brand.com"
    )
    await expect(body.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument()
    await expect(body.getByText("ada@example.com")).toBeInTheDocument()
  },
}

/** A pointer click on Sign out must run the action, independent of the menu's exit animation. */
export const SignOut: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Account menu for Ada Lovelace" }))
    const body = within(document.body)
    await userEvent.click(await body.findByRole("menuitem", { name: "Sign out" }))
    await waitFor(() => expect(args.signOut).toHaveBeenCalledTimes(1))
    // The menu stays open until the action's redirect replaces the page.
    await expect(body.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument()
  },
}

export const EmailOnly: Story = {
  args: { user: { name: "", email: "ada@example.com" } },
}

export const WithAvatar: Story = {
  args: {
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: "https://github.com/shadcn.png",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Account menu for Ada Lovelace" })
    await expect(trigger.querySelector("img")).toBeInTheDocument()
  },
}

export const Impersonating: Story = {
  args: { note: "(impersonating)" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: "Account menu for Ada Lovelace (impersonating)" })
    )
    const body = within(document.body)
    await expect(await body.findByText("Ada Lovelace (impersonating)")).toBeInTheDocument()
  },
}

/** The workspace switcher: two workspaces, the second current, one pending invitation. */
export const WithWorkspaces: Story = {
  args: {
    workspaces: {
      items: [
        { id: 1, name: "Analytical Engines" },
        { id: 2, name: "Difference Ltd" },
      ],
      currentId: 2,
      switchTo: fn(async (_formData: FormData) => {}),
      pendingInvitations: 1,
      newUrl: "https://app.brand.com/workspaces/new",
      manageUrl: "https://account.brand.com/workspace",
      canManage: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: "Account menu for Ada Lovelace, 1 pending invitation" })
    )
    const body = within(document.body)
    await expect(await body.findByRole("menuitem", { name: "Difference Ltd" })).toHaveAttribute(
      "aria-current",
      "true"
    )
    await expect(body.getByRole("menuitem", { name: "Analytical Engines" })).not.toHaveAttribute(
      "aria-current"
    )
    await expect(body.getByRole("menuitem", { name: "Manage members" })).toHaveAttribute(
      "href",
      "https://account.brand.com/workspace"
    )
    await expect(body.getByRole("menuitem", { name: "Invitations 1" })).toBeInTheDocument()
  },
}

/** Picking a workspace must run the switch action, whatever the menu's exit animation does. */
export const SwitchWorkspace: Story = {
  args: WithWorkspaces.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: /^Account menu for Ada Lovelace/ }))
    const body = within(document.body)
    await userEvent.click(await body.findByRole("menuitem", { name: "Analytical Engines" }))
    const switchTo = args.workspaces?.switchTo as ReturnType<typeof fn>
    await waitFor(() => expect(switchTo).toHaveBeenCalledTimes(1))
    const formData = switchTo.mock.calls[0]?.[0] as FormData
    await expect(formData?.get("workspaceId")).toBe("1")
    // The menu closes once the action has resolved.
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument())
  },
}
