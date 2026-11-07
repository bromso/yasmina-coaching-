import { ShineBorder } from "@repo/ui/components/shine-border"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Surfaces/ShineBorder",
  component: ShineBorder,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    borderWidth: {
      control: { type: "number", min: 1, max: 10, step: 1 },
      description: "Width of the border in pixels",
    },
    duration: {
      control: { type: "number", min: 1, max: 30, step: 1 },
      description: "Duration of the animation in seconds",
    },
    shineColor: {
      control: "color",
      description: "Color of the shine effect (single color or array)",
    },
  },
} satisfies Meta<typeof ShineBorder>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative rounded-xl border p-6 w-80">
      <ShineBorder {...args} />
      <h3 className="text-lg font-semibold">Shine Border</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        This card has a subtle animated shine border effect.
      </p>
    </div>
  ),
  args: {
    shineColor: "#6366F1",
  },
}

export const MultiColor: Story = {
  render: (args) => (
    <div className="relative rounded-xl border p-6 w-80">
      <ShineBorder {...args} />
      <h3 className="text-lg font-semibold">Multi-Color Shine</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        Multiple colors create a rainbow-like shine effect.
      </p>
    </div>
  ),
  args: {
    shineColor: ["#FF0080", "#7928CA", "#0070F3"],
    borderWidth: 2,
  },
}

export const ThickBorder: Story = {
  render: (args) => (
    <div className="relative rounded-xl border p-6 w-80">
      <ShineBorder {...args} />
      <h3 className="text-lg font-semibold">Thick Border</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        A thicker border makes the shine more prominent.
      </p>
    </div>
  ),
  args: {
    shineColor: "#10B981",
    borderWidth: 4,
    duration: 8,
  },
}

export const FastAnimation: Story = {
  render: (args) => (
    <div className="relative rounded-full border p-6 w-80">
      <ShineBorder {...args} />
      <p className="text-center text-sm font-medium">Fast shine on a rounded container</p>
    </div>
  ),
  args: {
    shineColor: "#F59E0B",
    duration: 4,
  },
}
