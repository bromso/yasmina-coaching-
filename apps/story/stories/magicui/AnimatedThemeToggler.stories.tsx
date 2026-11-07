import { AnimatedThemeToggler } from "@repo/ui/components/magicui/animated-theme-toggler"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Buttons/AnimatedThemeToggler",
  component: AnimatedThemeToggler,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    duration: {
      control: { type: "number", min: 100, max: 2000, step: 100 },
      description: "Duration of the view transition animation in milliseconds",
    },
  },
  args: {
    duration: 400,
  },
} satisfies Meta<typeof AnimatedThemeToggler>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <AnimatedThemeToggler
      {...args}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background hover:bg-accent"
    />
  ),
}

export const SlowTransition: Story = {
  args: {
    duration: 1000,
  },
  render: (args) => (
    <AnimatedThemeToggler
      {...args}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background hover:bg-accent"
    />
  ),
}

export const Large: Story = {
  render: (args) => (
    <AnimatedThemeToggler
      {...args}
      className="inline-flex h-14 w-14 items-center justify-center rounded-full border bg-background text-xl hover:bg-accent [&_svg]:size-6"
    />
  ),
}

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <AnimatedThemeToggler
        {...args}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background hover:bg-accent"
      />
      <span className="text-sm text-muted-foreground">Toggle theme</span>
    </div>
  ),
}
