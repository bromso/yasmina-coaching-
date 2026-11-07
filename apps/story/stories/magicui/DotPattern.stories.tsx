import { DotPattern } from "@repo/ui/components/magicui/dot-pattern"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/DotPattern",
  component: DotPattern,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "number", min: 8, max: 64 },
      description: "Horizontal spacing between dots",
    },
    height: {
      control: { type: "number", min: 8, max: 64 },
      description: "Vertical spacing between dots",
    },
    cr: {
      control: { type: "number", min: 0.5, max: 5, step: 0.5 },
      description: "Radius of each dot",
    },
    glow: {
      control: "boolean",
      description: "Whether dots should have a glowing animation effect",
    },
  },
  args: {
    width: 16,
    height: 16,
    cr: 1,
    glow: false,
  },
} satisfies Meta<typeof DotPattern>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Dot Pattern</span>
      <DotPattern {...args} />
    </div>
  ),
}

export const Glowing: Story = {
  args: {
    glow: true,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Glowing Dots</span>
      <DotPattern {...args} />
    </div>
  ),
}

export const LargeSpacing: Story = {
  args: {
    width: 32,
    height: 32,
    cr: 2,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <DotPattern {...args} />
    </div>
  ),
}

export const WithMask: Story = {
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Masked Dots</span>
      <DotPattern
        {...args}
        className="[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]"
      />
    </div>
  ),
}
