import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  reference: "BK-2044",
  offeringLabel: "coaching session",
  when: "Tuesday 12 May 2026, 10:00",
  byCustomer: true,
  name: "Ada Lovelace",
}

const meta = {
  title: "Email/BookingCancelled",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.bookingCancelled(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your booking is cancelled (BK-2044)")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("As requested")
  },
}

export const ByYasmina: Story = {
  args: {
    render: () =>
      emails.bookingCancelled({
        ...props,
        byCustomer: false,
        note: "I have come down with the flu. I will be in touch with new dates shortly.",
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("text")).toHaveTextContent("Yasmina has had to cancel")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("come down with the flu")
  },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.bookingCancelled(
        { ...props, offeringLabel: "coachingsession", when: "tisdag 12 maj 2026 kl. 10.00" },
        "sv"
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Din bokning är avbokad (BK-2044)")
    )
  },
}
