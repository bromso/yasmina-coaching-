import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/StatusPage",
  component: StatusPage,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof StatusPage>

export default meta
type Story = StoryObj<typeof meta>

export const NotFound: Story = {
  args: {
    code: "404",
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
  },
  render: (args) => (
    <StatusPage {...args}>
      <Button asChild size="lg">
        <a href="/">Back to home</a>
      </Button>
    </StatusPage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found")
    await expect(canvas.getByRole("link", { name: "Back to home" })).toBeVisible()
  },
}

export const ServerError: Story = {
  args: {
    code: "500",
    title: "Something went wrong",
    description: "An unexpected error occurred. Try again, or head back home.",
  },
  render: (args) => (
    <StatusPage {...args}>
      <Button size="lg">Try again</Button>
      <Button asChild size="lg" variant="outline">
        <a href="/">Back to home</a>
      </Button>
    </StatusPage>
  ),
}

export const WithReference: Story = {
  args: {
    code: "500",
    title: "Something went wrong",
    description: "An unexpected error occurred. Try again, or head back home. Reference: 3f9a1c2b",
  },
}
