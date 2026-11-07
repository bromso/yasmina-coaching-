import { Lens } from "@repo/ui/components/lens"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/Lens",
  component: Lens,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    zoomFactor: {
      control: { type: "number", min: 1.1, max: 3, step: 0.1 },
      description: "Zoom magnification factor",
    },
    lensSize: {
      control: { type: "number", min: 50, max: 400 },
      description: "Diameter of the lens in pixels",
    },
    isStatic: {
      control: "boolean",
      description: "Whether the lens position is fixed",
    },
    duration: {
      control: { type: "number", min: 0, max: 1, step: 0.05 },
      description: "Animation duration in seconds",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
  },
} satisfies Meta<typeof Lens>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Lens {...args}>
      <img
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=400&fit=crop"
        alt="Landscape"
        className="h-[400px] w-[600px] object-cover"
      />
    </Lens>
  ),
  args: {
    zoomFactor: 1.3,
    lensSize: 170,
  },
}

export const HighZoom: Story = {
  render: (args) => (
    <Lens {...args}>
      <img
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=400&fit=crop"
        alt="Landscape"
        className="h-[400px] w-[600px] object-cover"
      />
    </Lens>
  ),
  args: {
    zoomFactor: 2,
    lensSize: 200,
  },
}

export const SmallLens: Story = {
  render: (args) => (
    <Lens {...args}>
      <img
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=400&fit=crop"
        alt="Landscape"
        className="h-[400px] w-[600px] object-cover"
      />
    </Lens>
  ),
  args: {
    zoomFactor: 1.5,
    lensSize: 80,
  },
}

export const StaticPosition: Story = {
  render: (args) => (
    <Lens {...args}>
      <img
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=400&fit=crop"
        alt="Landscape"
        className="h-[400px] w-[600px] object-cover"
      />
    </Lens>
  ),
  args: {
    zoomFactor: 1.5,
    lensSize: 170,
    isStatic: true,
    position: { x: 300, y: 200 },
  },
}

export const WithTextContent: Story = {
  render: (args) => (
    <Lens {...args}>
      <div className="flex h-[300px] w-[500px] flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-900 to-zinc-800 p-8">
        <h2 className="text-3xl font-bold text-white">Magnify Text</h2>
        <p className="text-center text-sm text-zinc-400">
          Hover over this card to zoom into the text content. The lens effect works with any
          children, not just images.
        </p>
      </div>
    </Lens>
  ),
  args: {
    zoomFactor: 1.5,
    lensSize: 150,
  },
}
