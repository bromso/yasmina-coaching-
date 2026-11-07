import { Fade, Fades } from "@repo/ui/components/animate-ui/primitives/effects/fade"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Fade",
  component: Fade,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delay: {
      control: { type: "number", min: 0, max: 2000, step: 100 },
    },
    initialOpacity: {
      control: { type: "number", min: 0, max: 1, step: 0.1 },
    },
    opacity: {
      control: { type: "number", min: 0, max: 1, step: 0.1 },
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
    initialOpacity: 0,
    opacity: 1,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof Fade>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Fade {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Fade In</h3>
        <p className="text-sm text-muted-foreground">This content fades into view.</p>
      </div>
    </Fade>
  ),
}

export const WithDelay: Story = {
  render: (args) => (
    <Fade {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Delayed Fade</h3>
        <p className="text-sm text-muted-foreground">This content fades in after a 500ms delay.</p>
      </div>
    </Fade>
  ),
  args: {
    delay: 500,
  },
}

export const PartialOpacity: Story = {
  render: (args) => (
    <Fade {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Partial Opacity</h3>
        <p className="text-sm text-muted-foreground">Fades to 50% opacity.</p>
      </div>
    </Fade>
  ),
  args: {
    opacity: 0.5,
  },
}

export const StaggeredList: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Fades holdDelay={150}>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 1</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 2</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 3</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 4</div>
      </Fades>
    </div>
  ),
}
