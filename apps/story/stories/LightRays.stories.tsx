import { LightRays } from "@repo/ui/components/light-rays"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/LightRays",
  component: LightRays,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    count: {
      control: { type: "number", min: 1, max: 20 },
      description: "Number of light rays",
    },
    color: {
      control: "color",
      description: "Color of the light rays",
    },
    blur: {
      control: { type: "number", min: 0, max: 100 },
      description: "Blur amount in pixels",
    },
    speed: {
      control: { type: "number", min: 1, max: 30 },
      description: "Animation cycle duration in seconds",
    },
    length: {
      control: "text",
      description: "Length of the rays (CSS value)",
    },
  },
} satisfies Meta<typeof LightRays>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <LightRays {...args} />
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-white/60">Light rays effect</p>
      </div>
    </div>
  ),
  args: {
    count: 7,
    color: "rgba(160, 210, 255, 0.2)",
    blur: 36,
    speed: 14,
    length: "70vh",
  },
}

export const WarmTones: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <LightRays {...args} />
    </div>
  ),
  args: {
    count: 5,
    color: "rgba(255, 180, 100, 0.25)",
    blur: 40,
    speed: 18,
    length: "80vh",
  },
}

export const IntenseGlow: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <LightRays {...args} />
    </div>
  ),
  args: {
    count: 12,
    color: "rgba(120, 200, 255, 0.35)",
    blur: 50,
    speed: 10,
  },
}

export const Subtle: Story = {
  render: (args) => (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">
      <LightRays {...args} />
    </div>
  ),
  args: {
    count: 3,
    color: "rgba(200, 200, 255, 0.1)",
    blur: 60,
    speed: 20,
    length: "50vh",
  },
}

export const InCard: Story = {
  render: (args) => (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <div className="relative h-[300px] w-[500px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
        <LightRays {...args} />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2">
          <h3 className="text-xl font-semibold text-white">Premium Feature</h3>
          <p className="text-sm text-white/50">Light rays contained in a card</p>
        </div>
      </div>
    </div>
  ),
  args: {
    count: 5,
    color: "rgba(167, 139, 250, 0.2)",
    blur: 30,
    length: "60vh",
  },
}
