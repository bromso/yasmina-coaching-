import { CopyButton } from "@repo/ui/components/animate-ui/components/buttons/copy"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Buttons/CopyButton",
  component: CopyButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "accent", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg"],
    },
    content: {
      control: "text",
    },
    delay: {
      control: "number",
    },
  },
  args: {
    content: "npm install @animate-ui/react",
    variant: "default",
    size: "default",
    delay: 3000,
  },
} satisfies Meta<typeof CopyButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Outline: Story = {
  args: {
    variant: "outline",
  },
}

export const Ghost: Story = {
  args: {
    variant: "ghost",
  },
}

export const Secondary: Story = {
  args: {
    variant: "secondary",
  },
}

export const ExtraSmall: Story = {
  args: {
    size: "xs",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
  },
}

export const Large: Story = {
  args: {
    size: "lg",
  },
}

export const ShortDelay: Story = {
  args: {
    delay: 1000,
  },
}

export const WithCodeSnippet: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
      <code className="flex-1">{args.content}</code>
      <CopyButton {...args} variant="ghost" size="xs" />
    </div>
  ),
  args: {
    content: "bun add motion",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <CopyButton content="default" variant="default" />
      <CopyButton content="accent" variant="accent" />
      <CopyButton content="destructive" variant="destructive" />
      <CopyButton content="outline" variant="outline" />
      <CopyButton content="secondary" variant="secondary" />
      <CopyButton content="ghost" variant="ghost" />
    </div>
  ),
}
