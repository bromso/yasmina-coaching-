import { OrbitingCircles } from "@repo/ui/components/magicui/orbiting-circles"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Effects/OrbitingCircles",
  component: OrbitingCircles,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    reverse: {
      control: "boolean",
      description: "Whether to reverse the orbit direction",
    },
    duration: {
      control: { type: "number", min: 5, max: 60 },
      description: "Duration of a full orbit in seconds",
    },
    radius: {
      control: { type: "number", min: 50, max: 300 },
      description: "Radius of the orbit path in pixels",
    },
    path: {
      control: "boolean",
      description: "Whether to show the orbit path circle",
    },
    iconSize: {
      control: { type: "number", min: 16, max: 80 },
      description: "Size of each orbiting icon in pixels",
    },
    speed: {
      control: { type: "number", min: 0.1, max: 5, step: 0.1 },
      description: "Speed multiplier for the orbit animation",
    },
  },
  args: {
    duration: 20,
    radius: 160,
    path: true,
    iconSize: 30,
    speed: 1,
    reverse: false,
  },
} satisfies Meta<typeof OrbitingCircles>

export default meta
type Story = StoryObj<typeof meta>

const IconPlaceholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-8 items-center justify-center rounded-full border bg-background text-xs font-bold shadow-sm">
    {children}
  </div>
)

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[400px] w-[400px] items-center justify-center">
      <span className="text-lg font-semibold">Center</span>
      <OrbitingCircles {...args}>
        <IconPlaceholder>A</IconPlaceholder>
        <IconPlaceholder>B</IconPlaceholder>
        <IconPlaceholder>C</IconPlaceholder>
        <IconPlaceholder>D</IconPlaceholder>
      </OrbitingCircles>
    </div>
  ),
}

export const Reversed: Story = {
  args: {
    reverse: true,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-[400px] items-center justify-center">
      <span className="text-lg font-semibold">Center</span>
      <OrbitingCircles {...args}>
        <IconPlaceholder>1</IconPlaceholder>
        <IconPlaceholder>2</IconPlaceholder>
        <IconPlaceholder>3</IconPlaceholder>
      </OrbitingCircles>
    </div>
  ),
}

export const NoPath: Story = {
  args: {
    path: false,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-[400px] items-center justify-center">
      <span className="text-lg font-semibold">Center</span>
      <OrbitingCircles {...args}>
        <IconPlaceholder>X</IconPlaceholder>
        <IconPlaceholder>Y</IconPlaceholder>
      </OrbitingCircles>
    </div>
  ),
}

export const DualOrbit: Story = {
  render: () => (
    <div className="relative flex h-[500px] w-[500px] items-center justify-center">
      <span className="text-lg font-semibold">Hub</span>
      <OrbitingCircles radius={100} speed={1.5}>
        <IconPlaceholder>A</IconPlaceholder>
        <IconPlaceholder>B</IconPlaceholder>
        <IconPlaceholder>C</IconPlaceholder>
      </OrbitingCircles>
      <OrbitingCircles radius={200} reverse speed={0.8}>
        <IconPlaceholder>1</IconPlaceholder>
        <IconPlaceholder>2</IconPlaceholder>
        <IconPlaceholder>3</IconPlaceholder>
        <IconPlaceholder>4</IconPlaceholder>
      </OrbitingCircles>
    </div>
  ),
}
