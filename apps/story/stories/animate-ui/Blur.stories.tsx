import { Blur, Blurs } from "@repo/ui/components/animate-ui/primitives/effects/blur"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Blur",
  component: Blur,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delay: {
      control: { type: "number", min: 0, max: 2000, step: 100 },
    },
    initialBlur: {
      control: { type: "number", min: 0, max: 30, step: 1 },
    },
    blur: {
      control: { type: "number", min: 0, max: 30, step: 1 },
    },
    inView: {
      control: "boolean",
    },
    inViewOnce: {
      control: "boolean",
    },
  },
  args: {
    delay: 0,
    initialBlur: 10,
    blur: 0,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof Blur>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Blur {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Blur Effect</h3>
        <p className="text-sm text-muted-foreground">This content unblurs into view.</p>
      </div>
    </Blur>
  ),
}

export const HeavyBlur: Story = {
  render: (args) => (
    <Blur {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Heavy Blur</h3>
        <p className="text-sm text-muted-foreground">Starts with a 25px blur radius.</p>
      </div>
    </Blur>
  ),
  args: {
    initialBlur: 25,
  },
}

export const WithDelay: Story = {
  render: (args) => (
    <Blur {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Delayed Blur</h3>
        <p className="text-sm text-muted-foreground">Unblurs after 500ms.</p>
      </div>
    </Blur>
  ),
  args: {
    delay: 500,
  },
}

export const StaggeredList: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Blurs holdDelay={200}>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 1</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 2</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 3</div>
      </Blurs>
    </div>
  ),
}
