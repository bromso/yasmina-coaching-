import { NeonGradientCard } from "@repo/ui/components/neon-gradient-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Surfaces/NeonGradientCard",
  component: NeonGradientCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    borderSize: {
      control: { type: "number", min: 1, max: 10, step: 1 },
      description: "Width of the neon border in pixels",
    },
    borderRadius: {
      control: { type: "number", min: 0, max: 50, step: 1 },
      description: "Border radius in pixels",
    },
    neonColors: {
      control: "object",
      description: "Object with firstColor and secondColor for the neon gradient",
    },
  },
} satisfies Meta<typeof NeonGradientCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <NeonGradientCard {...args} className="w-80">
      <h3 className="text-lg font-semibold">Neon Gradient Card</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        A card with an animated neon gradient border that glows.
      </p>
    </NeonGradientCard>
  ),
}

export const CustomColors: Story = {
  render: (args) => (
    <NeonGradientCard {...args} className="w-80">
      <h3 className="text-lg font-semibold">Custom Neon</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        Blue and purple neon gradient with a thicker border.
      </p>
    </NeonGradientCard>
  ),
  args: {
    neonColors: {
      firstColor: "#6366F1",
      secondColor: "#A855F7",
    },
    borderSize: 4,
  },
}

export const LargeRadius: Story = {
  render: (args) => (
    <NeonGradientCard {...args} className="w-80">
      <h3 className="text-lg font-semibold">Rounded</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        Extra rounded corners with warm neon colors.
      </p>
    </NeonGradientCard>
  ),
  args: {
    borderRadius: 40,
    neonColors: {
      firstColor: "#F59E0B",
      secondColor: "#EF4444",
    },
  },
}

export const WithRichContent: Story = {
  render: () => (
    <NeonGradientCard className="w-96">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
            <span className="text-primary text-lg font-bold">N</span>
          </div>
          <div>
            <h3 className="font-semibold">Neon Card</h3>
            <p className="text-muted-foreground text-xs">Premium feature</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          This card demonstrates richer content layout with a neon border effect.
        </p>
      </div>
    </NeonGradientCard>
  ),
}
