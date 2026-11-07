import { Particles } from "@repo/ui/components/particles"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/Particles",
  component: Particles,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    quantity: {
      control: { type: "number", min: 10, max: 500 },
      description: "Number of particles",
    },
    color: {
      control: "color",
      description: "Particle color (hex)",
    },
    size: {
      control: { type: "number", min: 0.1, max: 3, step: 0.1 },
      description: "Base particle size",
    },
    staticity: {
      control: { type: "number", min: 10, max: 200 },
      description: "How static the particles are (higher = less mouse influence)",
    },
    ease: {
      control: { type: "number", min: 10, max: 200 },
      description: "Easing factor for mouse interaction",
    },
    vx: {
      control: { type: "number", min: -1, max: 1, step: 0.05 },
      description: "Horizontal velocity",
    },
    vy: {
      control: { type: "number", min: -1, max: 1, step: 0.05 },
      description: "Vertical velocity",
    },
  },
} satisfies Meta<typeof Particles>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative h-screen w-full bg-zinc-950">
      <Particles className="absolute inset-0" {...args} />
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-white">Move your mouse around</p>
      </div>
    </div>
  ),
  args: {
    quantity: 100,
    color: "#ffffff",
  },
}

export const BlueParticles: Story = {
  render: (args) => (
    <div className="relative h-screen w-full bg-zinc-950">
      <Particles className="absolute inset-0" {...args} />
    </div>
  ),
  args: {
    quantity: 150,
    color: "#4f9cf7",
    size: 0.6,
  },
}

export const HighDensity: Story = {
  render: (args) => (
    <div className="relative h-screen w-full bg-zinc-950">
      <Particles className="absolute inset-0" {...args} />
    </div>
  ),
  args: {
    quantity: 400,
    color: "#ffffff",
    size: 0.3,
  },
}

export const Drifting: Story = {
  render: (args) => (
    <div className="relative h-screen w-full bg-zinc-950">
      <Particles className="absolute inset-0" {...args} />
    </div>
  ),
  args: {
    quantity: 80,
    color: "#a78bfa",
    vx: 0.1,
    vy: -0.05,
  },
}

export const LowStaticity: Story = {
  render: (args) => (
    <div className="relative h-screen w-full bg-zinc-950">
      <Particles className="absolute inset-0" {...args} />
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-white">Particles follow mouse closely</p>
      </div>
    </div>
  ),
  args: {
    quantity: 100,
    color: "#22d3ee",
    staticity: 15,
    ease: 20,
  },
}
