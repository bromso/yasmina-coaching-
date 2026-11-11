import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  reference: "LEAD-12",
  nextStep: "inner" as const,
  nextStepUrl: "https://www.brand.com/book/inner_start_coaching",
}

const meta = {
  title: "Email/LeadReceived",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.leadReceived(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Thank you for getting in touch (LEAD-12)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Book a start call")
  },
}

export const Proposal: Story = {
  args: {
    render: () =>
      emails.leadReceived({
        ...props,
        nextStep: "proposal",
        nextStepUrl: "https://www.brand.com/book/workshop",
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByTestId("text")).toHaveTextContent("Suggest dates"))
  },
}

export const Swedish: Story = {
  args: { render: () => emails.leadReceived({ ...props, nextStep: "coaching" }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Tack för att du hörde av dig (LEAD-12)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Boka ett samtal")
  },
}
