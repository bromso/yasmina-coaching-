import { Shine } from "@repo/ui/components/animate-ui/primitives/effects/shine"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Shine",
  component: Shine,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: "color",
    },
    opacity: {
      control: { type: "number", min: 0, max: 1, step: 0.05 },
    },
    delay: {
      control: { type: "number", min: 0, max: 2000, step: 100 },
    },
    duration: {
      control: { type: "number", min: 200, max: 3000, step: 100 },
    },
    loop: {
      control: "boolean",
    },
    loopDelay: {
      control: { type: "number", min: 0, max: 5000, step: 100 },
    },
    deg: {
      control: { type: "number", min: -90, max: 90, step: 5 },
    },
    enable: {
      control: "boolean",
    },
    enableOnHover: {
      control: "boolean",
    },
    enableOnTap: {
      control: "boolean",
    },
  },
  args: {
    color: "currentColor",
    opacity: 0.3,
    delay: 0,
    duration: 1200,
    loop: false,
    loopDelay: 0,
    deg: -15,
    enable: true,
    enableOnHover: false,
    enableOnTap: false,
  },
} satisfies Meta<typeof Shine>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Shine {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm w-64">
        <h3 className="text-lg font-semibold">Shine Effect</h3>
        <p className="text-sm text-muted-foreground">A shine sweeps across the element.</p>
      </div>
    </Shine>
  ),
}

export const Looping: Story = {
  render: (args) => (
    <Shine {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm w-64">
        <h3 className="text-lg font-semibold">Looping Shine</h3>
        <p className="text-sm text-muted-foreground">Continuous shine animation.</p>
      </div>
    </Shine>
  ),
  args: {
    loop: true,
    loopDelay: 1000,
  },
}

export const OnHover: Story = {
  render: (args) => (
    <Shine {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm w-64 cursor-pointer">
        <h3 className="text-lg font-semibold">Hover Me</h3>
        <p className="text-sm text-muted-foreground">Shine triggers on hover.</p>
      </div>
    </Shine>
  ),
  args: {
    enable: true,
    enableOnHover: true,
  },
}

export const OnTap: Story = {
  render: (args) => (
    <Shine {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm w-64 cursor-pointer">
        <h3 className="text-lg font-semibold">Click Me</h3>
        <p className="text-sm text-muted-foreground">Shine triggers on tap/click.</p>
      </div>
    </Shine>
  ),
  args: {
    enable: true,
    enableOnTap: true,
  },
}

export const CustomColor: Story = {
  render: (args) => (
    <Shine {...args}>
      <div className="rounded-lg bg-blue-600 p-6 text-white w-64">
        <h3 className="text-lg font-semibold">Blue Shine</h3>
        <p className="text-sm opacity-80">With a white shine overlay.</p>
      </div>
    </Shine>
  ),
  args: {
    color: "white",
    opacity: 0.4,
    loop: true,
    loopDelay: 2000,
  },
}
