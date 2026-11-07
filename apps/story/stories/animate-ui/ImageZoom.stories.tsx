import { Image, ImageZoom } from "@repo/ui/components/animate-ui/primitives/effects/image-zoom"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/ImageZoom",
  component: ImageZoom,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    zoomScale: {
      control: { type: "number", min: 1, max: 10, step: 0.5 },
    },
    zoomOnClick: {
      control: "boolean",
    },
    zoomOnHover: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: undefined,
    zoomScale: 3,
    zoomOnClick: true,
    zoomOnHover: true,
    disabled: false,
  },
} satisfies Meta<typeof ImageZoom>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <ImageZoom {...args} width={400} height={300}>
      <Image
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=600&fit=crop"
        alt="Mountain landscape"
      />
    </ImageZoom>
  ),
}

export const ClickOnly: Story = {
  render: (args) => (
    <ImageZoom {...args} width={400} height={300}>
      <Image
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=600&fit=crop"
        alt="Mountain landscape"
      />
    </ImageZoom>
  ),
  args: {
    zoomOnClick: true,
    zoomOnHover: false,
  },
}

export const HoverOnly: Story = {
  render: (args) => (
    <ImageZoom {...args} width={400} height={300}>
      <Image
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=600&fit=crop"
        alt="Mountain landscape"
      />
    </ImageZoom>
  ),
  args: {
    zoomOnClick: false,
    zoomOnHover: true,
  },
}

export const HighZoom: Story = {
  render: (args) => (
    <ImageZoom {...args} width={400} height={300}>
      <Image
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=600&fit=crop"
        alt="Mountain landscape"
      />
    </ImageZoom>
  ),
  args: {
    zoomScale: 6,
  },
}

export const Disabled: Story = {
  render: (args) => (
    <ImageZoom {...args} width={400} height={300}>
      <Image
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=600&fit=crop"
        alt="Mountain landscape"
      />
    </ImageZoom>
  ),
  args: {
    disabled: true,
  },
}
