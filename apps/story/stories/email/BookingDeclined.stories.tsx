import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = { reference: "BK-2043", offeringLabel: "workshop", name: "Ada Lovelace" }

const meta = {
  title: "Email/BookingDeclined",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.bookingDeclined(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("About your request (BK-2043)")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("at the dates you proposed")
  },
}

export const WithNote: Story = {
  args: {
    render: () =>
      emails.bookingDeclined({
        ...props,
        note: "I am fully booked in May, but I have room in June if that works for you.",
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("text")).toHaveTextContent("I am fully booked in May")
    )
  },
}

export const Swedish: Story = {
  args: { render: () => emails.bookingDeclined(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Angående din förfrågan (BK-2043)")
    )
  },
}
