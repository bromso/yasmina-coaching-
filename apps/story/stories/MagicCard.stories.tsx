import { MagicCard } from "@repo/ui/components/magic-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Surfaces/MagicCard",
  component: MagicCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    gradientSize: {
      control: { type: "number", min: 50, max: 500, step: 10 },
      description: "Size of the gradient circle in pixels",
    },
    gradientColor: {
      control: "color",
      description: "Color of the inner gradient on hover",
    },
    gradientOpacity: {
      control: { type: "number", min: 0, max: 1, step: 0.1 },
      description: "Opacity of the gradient overlay",
    },
    gradientFrom: {
      control: "color",
      description: "Starting color of the border gradient",
    },
    gradientTo: {
      control: "color",
      description: "Ending color of the border gradient",
    },
  },
} satisfies Meta<typeof MagicCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <MagicCard {...args} className="w-80 rounded-xl p-6">
      <h3 className="text-lg font-semibold">Magic Card</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        Hover over this card to see the gradient follow your cursor.
      </p>
    </MagicCard>
  ),
}

export const CustomGradient: Story = {
  render: (args) => (
    <MagicCard {...args} className="w-80 rounded-xl p-6">
      <h3 className="text-lg font-semibold">Custom Gradient</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        This card uses a blue-to-green gradient border effect.
      </p>
    </MagicCard>
  ),
  args: {
    gradientFrom: "#3B82F6",
    gradientTo: "#10B981",
    gradientColor: "#1E3A5F",
  },
}

export const LargeGradient: Story = {
  render: (args) => (
    <MagicCard {...args} className="w-80 rounded-xl p-6">
      <h3 className="text-lg font-semibold">Large Gradient</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        A bigger gradient radius creates a more diffused effect.
      </p>
    </MagicCard>
  ),
  args: {
    gradientSize: 400,
  },
}

export const MultipleCards: Story = {
  render: () => (
    <div className="flex gap-4">
      <MagicCard className="w-60 rounded-xl p-6">
        <h3 className="text-lg font-semibold">Card One</h3>
        <p className="text-muted-foreground mt-2 text-sm">First card in a group.</p>
      </MagicCard>
      <MagicCard
        className="w-60 rounded-xl p-6"
        gradientFrom="#F59E0B"
        gradientTo="#EF4444"
        gradientColor="#4A2000"
      >
        <h3 className="text-lg font-semibold">Card Two</h3>
        <p className="text-muted-foreground mt-2 text-sm">Second card with warm colors.</p>
      </MagicCard>
      <MagicCard
        className="w-60 rounded-xl p-6"
        gradientFrom="#10B981"
        gradientTo="#06B6D4"
        gradientColor="#0A3D2E"
      >
        <h3 className="text-lg font-semibold">Card Three</h3>
        <p className="text-muted-foreground mt-2 text-sm">Third card with cool colors.</p>
      </MagicCard>
    </div>
  ),
}
