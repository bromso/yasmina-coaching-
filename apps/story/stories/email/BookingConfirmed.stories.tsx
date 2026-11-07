import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const manageUrl = "https://www.brand.com/bookings/BK-2041?token=example"
const props = {
  reference: "BK-2041",
  offeringLabel: "coaching session",
  when: "Tuesday 12 May 2026, 10:00",
  where: "online",
  manageUrl,
  name: "Ada Lovelace",
  cancelCutoffHours: 24,
}

const meta = {
  title: "Email/BookingConfirmed",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.bookingConfirmed(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your booking is confirmed (BK-2041)")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(manageUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("until 24 hours before a session")
  },
}

export const WithFurtherSessions: Story = {
  args: {
    render: () =>
      emails.bookingConfirmed({
        ...props,
        offeringLabel: "coaching programme",
        extraSessions: ["Tuesday 19 May 2026, 10:00", "Tuesday 26 May 2026, 10:00"],
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("text")).toHaveTextContent("Tuesday 26 May 2026, 10:00")
    )
  },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.bookingConfirmed(
        { ...props, offeringLabel: "coachingsession", when: "tisdag 12 maj 2026 kl. 10.00" },
        "sv"
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Din bokning är bekräftad (BK-2041)")
    )
  },
}

export const AfterAStartCall: Story = {
  args: {
    render: () =>
      emails.bookingConfirmed({
        ...props,
        offeringLabel: "Start call, transformative coaching",
        memberBookingUrl: "https://www.brand.com/book/inner_session",
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("text")).toHaveTextContent(
        "Once you have started, book your sessions here: https://www.brand.com/book/inner_session"
      )
    )
  },
}
