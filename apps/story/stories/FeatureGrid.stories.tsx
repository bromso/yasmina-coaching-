import { FeatureGrid } from "@repo/ui/blocks/feature-grid"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const features = [
  {
    icon: <Icon icon="lucide:zap" />,
    title: "Fast",
    description: "Ships in minutes, not sprints.",
  },
  {
    icon: <Icon icon="lucide:shield-check" />,
    title: "Secure",
    description: "Security headers and CSRF checks out of the box.",
  },
  {
    icon: <Icon icon="lucide:puzzle" />,
    title: "Composable",
    description: "Blocks and components you can mix and match.",
  },
]

const meta = {
  title: "Blocks/FeatureGrid",
  component: FeatureGrid,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    heading: { eyebrow: "Why us", title: "Everything you need" },
    features,
    columns: 3,
  },
} satisfies Meta<typeof FeatureGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole("article")).toHaveLength(features.length)
  },
}

export const TwoColumns: Story = {
  args: { columns: 2, features: features.slice(0, 2) },
}

export const FourColumns: Story = {
  args: {
    columns: 4,
    features: [...features, { title: "Reliable", description: "Tested end to end." }],
  },
}
