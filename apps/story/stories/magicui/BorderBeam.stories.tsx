import { BorderBeam } from "@repo/ui/components/magicui/border-beam"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Effects/BorderBeam",
  component: BorderBeam,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "number", min: 20, max: 200 },
      description: "Size of the border beam element",
    },
    duration: {
      control: { type: "number", min: 1, max: 20 },
      description: "Duration of one full loop in seconds",
    },
    delay: {
      control: { type: "number", min: 0, max: 10 },
      description: "Delay before animation starts",
    },
    colorFrom: {
      control: "color",
      description: "Starting gradient color",
    },
    colorTo: {
      control: "color",
      description: "Ending gradient color",
    },
    reverse: {
      control: "boolean",
      description: "Whether to reverse the animation direction",
    },
    borderWidth: {
      control: { type: "number", min: 1, max: 5 },
      description: "Width of the beam border in pixels",
    },
  },
  args: {
    size: 50,
    duration: 6,
    delay: 0,
    colorFrom: "#ffaa40",
    colorTo: "#9c40ff",
    reverse: false,
    borderWidth: 1,
  },
} satisfies Meta<typeof BorderBeam>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-40 w-80 items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <span className="text-sm text-muted-foreground">Card with border beam</span>
      <BorderBeam {...args} />
    </div>
  ),
}

export const CustomColors: Story = {
  args: {
    colorFrom: "#00ff88",
    colorTo: "#0088ff",
    size: 80,
  },
  render: (args) => (
    <div className="relative flex h-40 w-80 items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <span className="text-sm text-muted-foreground">Custom colors</span>
      <BorderBeam {...args} />
    </div>
  ),
}

export const Reversed: Story = {
  args: {
    reverse: true,
  },
  render: (args) => (
    <div className="relative flex h-40 w-80 items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <span className="text-sm text-muted-foreground">Reversed direction</span>
      <BorderBeam {...args} />
    </div>
  ),
}

export const ThickBorder: Story = {
  args: {
    borderWidth: 3,
    size: 100,
    duration: 8,
  },
  render: (args) => (
    <div className="relative flex h-40 w-80 items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <span className="text-sm text-muted-foreground">Thick beam border</span>
      <BorderBeam {...args} />
    </div>
  ),
}

export const Fast: Story = {
  args: {
    duration: 2,
    size: 60,
  },
  render: (args) => (
    <div className="relative flex h-40 w-80 items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <span className="text-sm text-muted-foreground">Fast animation</span>
      <BorderBeam {...args} />
    </div>
  ),
}
