import { AspectRatio } from "@repo/ui/components/aspect-ratio"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Layout/AspectRatio",
  component: AspectRatio,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    ratio: {
      control: { type: "number", min: 0.1, max: 5, step: 0.1 },
      description: "The desired aspect ratio (width/height)",
    },
  },
} satisfies Meta<typeof AspectRatio>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="w-[450px]">
      <AspectRatio ratio={16 / 9} className="bg-muted">
        <img
          src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&dpr=2&q=80"
          alt="Minimalist gray wall with subtle texture by Drew Beamer"
          className="h-full w-full rounded-md object-cover"
        />
      </AspectRatio>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const image = canvas.getByRole("img")
    await expect(image).toBeInTheDocument()
    await expect(image).toHaveAttribute(
      "alt",
      "Minimalist gray wall with subtle texture by Drew Beamer"
    )
  },
}

export const Square: Story = {
  render: () => (
    <div className="w-[300px]">
      <AspectRatio ratio={1} className="bg-muted">
        <img
          src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&dpr=2&q=80"
          alt="Minimalist gray wall with subtle texture by Drew Beamer"
          className="h-full w-full rounded-md object-cover"
        />
      </AspectRatio>
    </div>
  ),
}

export const Portrait: Story = {
  render: () => (
    <div className="w-[200px]">
      <AspectRatio ratio={3 / 4} className="bg-muted">
        <img
          src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&dpr=2&q=80"
          alt="Minimalist gray wall with subtle texture by Drew Beamer"
          className="h-full w-full rounded-md object-cover"
        />
      </AspectRatio>
    </div>
  ),
}

export const WithPlaceholder: Story = {
  render: () => (
    <div className="w-[450px]">
      <AspectRatio ratio={16 / 9} className="bg-muted flex items-center justify-center rounded-md">
        <span className="text-muted-foreground text-sm">16:9 Aspect Ratio</span>
      </AspectRatio>
    </div>
  ),
}
