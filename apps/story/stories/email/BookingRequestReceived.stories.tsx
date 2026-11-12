import { emails } from "@repo/email"
import { legalPath } from "@repo/sites/legal"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const manageUrl = "https://www.brand.com/bookings/BK-2042?token=example"
const legal = "https://legal.brand.com"
const termsUrl = `${legal}${legalPath("terms", "en")}`
const props = {
  reference: "BK-2042",
  offeringLabel: "leadership programme",
  manageUrl,
  name: "Ada Lovelace",
  termsUrl,
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
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      `The terms for your booking: ${termsUrl}`
    )
  },
}

export const WithoutName: Story = {
  args: { render: () => emails.bookingRequestReceived({ ...props, name: undefined }) },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.bookingRequestReceived(
        {
          ...props,
          offeringLabel: "ledarskapsprogram",
          termsUrl: `${legal}${legalPath("terms", "sv")}`,
        },
        "sv"
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Vi har tagit emot din förfrågan (BK-2042)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      `Villkoren för bokningen: ${legal}${legalPath("terms", "sv")}`
    )
  },
}
