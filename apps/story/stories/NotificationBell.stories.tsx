import { NotificationBell } from "@repo/ui/blocks/notification-bell"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/NotificationBell",
  component: NotificationBell,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    count: 3,
    href: "#notifications",
    label: "3 unread notifications",
  },
} satisfies Meta<typeof NotificationBell>

export default meta
type Story = StoryObj<typeof meta>

/** Three unread: the badge shows the number, the link is named by the plural label. */
export const Unread: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "3 unread notifications" })).toBeVisible()
    await expect(canvas.getByRole("status")).toHaveTextContent("3 unread notifications")
  },
}

/** Above 99 the badge reads `99+`. */
export const Many: Story = {
  args: { count: 140, label: "More than 99 unread notifications" },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-slot="notification-bell-badge"]')
    ).toHaveTextContent("99+")
  },
}

/** Nothing unread: no badge. */
export const NoneUnread: Story = {
  args: { count: 0, label: "No unread notifications" },
}

/** The count could not be read (the api was down): the bell without a badge. */
export const Unknown: Story = {
  args: { count: null, label: "Notifications" },
}
