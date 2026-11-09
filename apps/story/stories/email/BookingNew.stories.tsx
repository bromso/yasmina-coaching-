import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const adminUrl = "https://auth.brand.com/admin/bookings/BK-2045"
const props = {
  reference: "BK-2045",
  offeringLabel: "Leadership workshop",
  kind: "group" as const,
  name: "Ada Lovelace",
  email: "ada@example.com",
  organisation: "Analytical Engines AB",
  phone: "+46 70 123 45 67",
  audience: "organisation" as const,
  location: "On site",
  when: "Tuesday 12 May 2026, 09:00",
  extraSessions: ["Tuesday 19 May 2026, 09:00"],
  attendees: 12,
  venue: "Our office in Stockholm",
  message: "We would like a focus on giving feedback.\n\nLooking forward to it!",
  adminUrl,
}

const meta = {
  title: "Email/BookingNew",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.bookingNew(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "New booking: Leadership workshop (BK-2045)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(adminUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("Analytical Engines AB")
    await expect(canvas.getByTestId("text")).toHaveTextContent("focus on giving feedback")
  },
}

export const Request: Story = {
  args: {
    render: () =>
      emails.bookingNew({
        reference: "BK-2046",
        offeringLabel: "Leadership programme",
        kind: "request",
        name: "Ada Lovelace",
        email: "ada@example.com",
        audience: "private",
        location: "Online",
        preferredDates: ["Week 22", "Week 23"],
        message: "Any afternoon works for me.",
        adminUrl: "https://auth.brand.com/admin/bookings/BK-2046",
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "New request: Leadership programme (BK-2046)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Week 23")
  },
}

export const Swedish: Story = {
  args: { render: () => emails.bookingNew(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Ny bokning: Leadership workshop (BK-2045)"
      )
    )
  },
}
