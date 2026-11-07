import { Separator } from "@repo/ui/components/separator"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Separator",
  component: Separator,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
} satisfies Meta<typeof Separator>

export default meta
type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  args: {
    orientation: "horizontal",
    decorative: false,
    className: "w-[300px]",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const separator = canvas.getByRole("separator")
    await expect(separator).toBeInTheDocument()
    await expect(separator).toHaveAttribute("data-orientation", "horizontal")
  },
}

export const Vertical: Story = {
  args: {
    orientation: "vertical",
    className: "h-[100px]",
  },
}

export const WithText: Story = {
  render: () => (
    <div className="w-[300px]">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Radix Primitives</h4>
        <p className="text-muted-foreground text-sm">An open-source UI component library.</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" />
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
      </div>
    </div>
  ),
}

export const InNavigation: Story = {
  render: () => (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <div>Home</div>
      <Separator orientation="vertical" />
      <div>About</div>
      <Separator orientation="vertical" />
      <div>Products</div>
      <Separator orientation="vertical" />
      <div>Contact</div>
    </div>
  ),
}
