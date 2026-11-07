import { Card, Cards } from "@repo/ui/components/mdx"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Mdx/Cards",
  component: Cards,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Cards>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Cards>
      <Card title="Getting started" href="/docs/getting-started">
        Install dependencies and run the app locally.
      </Card>
      <Card title="Authentication" href="/docs/authentication">
        Sign-in, sessions and two-step verification.
      </Card>
      <Card title="Deploying" href="/docs/deploying" />
    </Cards>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "Getting started" })).toHaveAttribute(
      "href",
      "/docs/getting-started"
    )
    await expect(
      canvas.getByText("Install dependencies and run the app locally.")
    ).toBeInTheDocument()
    // Deploying has no description (no children) — just the title link.
    await expect(canvas.getByRole("link", { name: "Deploying" })).toHaveAttribute(
      "href",
      "/docs/deploying"
    )
  },
}

export const SingleCard: Story = {
  render: () => (
    <Cards>
      <Card title="Architecture" href="/docs/architecture">
        How the monorepo's apps and packages fit together.
      </Card>
    </Cards>
  ),
}
