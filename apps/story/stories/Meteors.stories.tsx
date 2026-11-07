import { Meteors } from "@repo/ui/components/meteors"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/Meteors",
  component: Meteors,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    number: {
      control: { type: "number", min: 1, max: 60 },
      description: "Number of meteors",
    },
    angle: {
      control: { type: "number", min: 0, max: 360 },
      description: "Angle of the meteor trail in degrees",
    },
    minDelay: {
      control: { type: "number", min: 0, max: 5, step: 0.1 },
    },
    maxDelay: {
      control: { type: "number", min: 0, max: 5, step: 0.1 },
    },
    minDuration: {
      control: { type: "number", min: 1, max: 20 },
    },
    maxDuration: {
      control: { type: "number", min: 1, max: 20 },
    },
  },
} satisfies Meta<typeof Meteors>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <Meteors {...args} />
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-white">Meteor shower background</p>
      </div>
    </div>
  ),
  args: {
    number: 20,
  },
}

export const Dense: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <Meteors {...args} />
    </div>
  ),
  args: {
    number: 50,
    minDuration: 2,
    maxDuration: 6,
  },
}

export const SteepAngle: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <Meteors {...args} />
    </div>
  ),
  args: {
    number: 15,
    angle: 260,
  },
}

export const SlowMeteors: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <Meteors {...args} />
    </div>
  ),
  args: {
    number: 10,
    minDuration: 8,
    maxDuration: 15,
  },
}
