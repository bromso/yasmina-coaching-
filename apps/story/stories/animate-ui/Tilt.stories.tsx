import { Tilt, TiltContent } from "@repo/ui/components/animate-ui/primitives/effects/tilt"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Tilt",
  component: Tilt,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    maxTilt: {
      control: { type: "number", min: 1, max: 45, step: 1 },
    },
    perspective: {
      control: { type: "number", min: 200, max: 2000, step: 100 },
    },
  },
  args: {
    maxTilt: 10,
    perspective: 800,
  },
} satisfies Meta<typeof Tilt>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Tilt {...args}>
      <TiltContent>
        <div className="rounded-xl border bg-card p-8 text-card-foreground shadow-lg w-64 h-40 flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold">Tilt Card</h3>
          <p className="text-sm text-muted-foreground text-center">
            Move your mouse over this card.
          </p>
        </div>
      </TiltContent>
    </Tilt>
  ),
}

export const SubtleTilt: Story = {
  render: (args) => (
    <Tilt {...args}>
      <TiltContent>
        <div className="rounded-xl border bg-card p-8 text-card-foreground shadow-lg w-64 h-40 flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold">Subtle</h3>
          <p className="text-sm text-muted-foreground text-center">Very gentle tilt effect.</p>
        </div>
      </TiltContent>
    </Tilt>
  ),
  args: {
    maxTilt: 5,
  },
}

export const ExtremeTilt: Story = {
  render: (args) => (
    <Tilt {...args}>
      <TiltContent>
        <div className="rounded-xl border bg-card p-8 text-card-foreground shadow-lg w-64 h-40 flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold">Extreme</h3>
          <p className="text-sm text-muted-foreground text-center">
            Strong tilt with close perspective.
          </p>
        </div>
      </TiltContent>
    </Tilt>
  ),
  args: {
    maxTilt: 30,
    perspective: 400,
  },
}
