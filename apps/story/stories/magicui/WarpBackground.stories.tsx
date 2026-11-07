import { WarpBackground } from "@repo/ui/components/magicui/warp-background"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/WarpBackground",
  component: WarpBackground,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    perspective: {
      control: { type: "number", min: 50, max: 500 },
      description: "CSS perspective value for the 3D effect",
    },
    beamsPerSide: {
      control: { type: "number", min: 1, max: 10 },
      description: "Number of beams per side of the container",
    },
    beamSize: {
      control: { type: "number", min: 1, max: 20 },
      description: "Size of each beam as a percentage",
    },
    beamDuration: {
      control: { type: "number", min: 1, max: 10 },
      description: "Duration of the beam animation in seconds",
    },
    beamDelayMax: {
      control: { type: "number", min: 0, max: 10 },
      description: "Maximum delay before a beam starts animating",
    },
    beamDelayMin: {
      control: { type: "number", min: 0, max: 5 },
      description: "Minimum delay before a beam starts animating",
    },
    gridColor: {
      control: "text",
      description: "Color of the background grid lines",
    },
  },
  args: {
    perspective: 100,
    beamsPerSide: 3,
    beamSize: 5,
    beamDuration: 3,
    beamDelayMax: 3,
    beamDelayMin: 0,
    gridColor: "var(--border)",
  },
} satisfies Meta<typeof WarpBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: undefined,
  },
  render: (args) => (
    <WarpBackground {...args} className="w-[500px]">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Warp Background</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A 3D perspective grid with animated beams
        </p>
      </div>
    </WarpBackground>
  ),
}

export const ManyBeams: Story = {
  args: {
    beamsPerSide: 8,
    beamSize: 3,
    beamDuration: 2,
    children: undefined,
  },
  render: (args) => (
    <WarpBackground {...args} className="w-[500px]">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Many Beams</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Increased beam density for a more dynamic effect
        </p>
      </div>
    </WarpBackground>
  ),
}

export const DeepPerspective: Story = {
  args: {
    perspective: 300,
    children: undefined,
  },
  render: (args) => (
    <WarpBackground {...args} className="w-[500px]">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Deep Perspective</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Higher perspective value for a flatter grid appearance
        </p>
      </div>
    </WarpBackground>
  ),
}

export const WithContent: Story = {
  args: {
    children: undefined,
  },
  render: (args) => (
    <WarpBackground {...args} className="w-[600px]">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Ship faster with Magic UI</h1>
        <p className="max-w-md text-muted-foreground">
          Beautiful, animated components built with Tailwind CSS, Motion, and React. Copy and paste
          into your apps.
        </p>
        <button
          type="button"
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
        >
          Get Started
        </button>
      </div>
    </WarpBackground>
  ),
}
