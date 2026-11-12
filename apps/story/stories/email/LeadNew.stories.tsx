import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const adminUrl = "https://auth.brand.com/admin/leads/12"
const props = {
  reference: "LEAD-12",
  audience: "Organisation",
  need: "Team development or supervision",
  timeline: "Within three months",
  contactMethod: "Phone",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+46 70 123 45 67",
  organisation: "Analytical Engines AB",
  role: "Head of unit",
  message: "Our management team needs to work as one again.\n\nThanks.",
  newsletter: false,
  page: "/kontakt",
  adminUrl,
}

const meta = {
  title: "Email/LeadNew",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.leadNew(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "New contact request LEAD-12: Team development or supervision"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(adminUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("Analytical Engines AB")
  },
}

export const PrivatePerson: Story = {
  args: {
    render: () =>
      emails.leadNew({
        reference: "LEAD-13",
        audience: "Private person",
        need: "Leadership coaching, one to one",
        timeline: "Within a month",
        contactMethod: "Email",
        name: "Bo Ek",
        email: "bo@example.com",
        newsletter: true,
        adminUrl: "https://auth.brand.com/admin/leads/13",
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByTestId("text")).toHaveTextContent("Newsletter: Yes"))
  },
}
