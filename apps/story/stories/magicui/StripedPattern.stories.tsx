import { StripedPattern } from "@repo/ui/components/magicui/striped-pattern"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/StripedPattern",
  component: StripedPattern,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    direction: {
      control: "select",
      options: ["left", "right"],
      description: "Direction of the stripe diagonals",
    },
    width: {
      control: { type: "number", min: 4, max: 40 },
      description: "Width of the stripe pattern unit",
    },
    height: {
      control: { type: "number", min: 4, max: 40 },
      description: "Height of the stripe pattern unit",
    },
  },
  args: {
    direction: "left",
    width: 10,
    height: 10,
  },
} satisfies Meta<typeof StripedPattern>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Striped Pattern</span>
      <StripedPattern {...args} className="text-neutral-300 dark:text-neutral-700" />
    </div>
  ),
}

export const RightDirection: Story = {
  args: {
    direction: "right",
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Right Stripes</span>
      <StripedPattern {...args} className="text-neutral-300 dark:text-neutral-700" />
    </div>
  ),
}

export const DenseStripes: Story = {
  args: {
    width: 5,
    height: 5,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <StripedPattern {...args} className="text-neutral-300 dark:text-neutral-700" />
    </div>
  ),
}

export const WideStripes: Story = {
  args: {
    width: 25,
    height: 25,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <StripedPattern {...args} className="text-neutral-300 dark:text-neutral-700" />
    </div>
  ),
}

export const Colored: Story = {
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Colored Stripes</span>
      <StripedPattern {...args} className="text-indigo-300 dark:text-indigo-700" />
    </div>
  ),
}
