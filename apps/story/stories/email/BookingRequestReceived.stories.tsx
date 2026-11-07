import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const manageUrl = "https://www.brand.com/bookings/BK-2042?token=example"
const props = {
  reference: "BK-2042",
  offeringLabel: "leadership programme",
  manageUrl,
  name: "Ada Lovelace",
}

const meta = {
  title: "Email/BookingRequestReceived",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.bookingRequestReceived(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "We've received your request (BK-2042)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(manageUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("within a few days")
  },
}

export const WithoutName: Story = {
  args: { render: () => emails.bookingRequestReceived({ ...props, name: undefined }) },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.bookingRequestReceived({ ...props, offeringLabel: "ledarskapsprogram" }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Vi har tagit emot din förfrågan (BK-2042)"
      )
    )
  },
}
