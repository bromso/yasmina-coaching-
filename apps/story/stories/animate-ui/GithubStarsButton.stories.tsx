import { GitHubStarsButton } from "@repo/ui/components/animate-ui/components/buttons/github-stars"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Buttons/GitHubStarsButton",
  component: GitHubStarsButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "accent", "outline", "ghost"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
    },
    value: {
      control: "number",
    },
    username: {
      control: "text",
    },
    repo: {
      control: "text",
    },
  },
  args: {
    username: "animate-ui",
    repo: "animate-ui",
    variant: "default",
    size: "default",
  },
} satisfies Meta<typeof GitHubStarsButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithStaticValue: Story = {
  args: {
    value: 4200,
  },
}

export const Outline: Story = {
  args: {
    variant: "outline",
    value: 1500,
  },
}

export const Ghost: Story = {
  args: {
    variant: "ghost",
    value: 850,
  },
}

export const Accent: Story = {
  args: {
    variant: "accent",
    value: 12000,
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    value: 3200,
  },
}

export const Large: Story = {
  args: {
    size: "lg",
    value: 25000,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <GitHubStarsButton username="animate-ui" repo="animate-ui" variant="default" value={1234} />
      <GitHubStarsButton username="animate-ui" repo="animate-ui" variant="accent" value={1234} />
      <GitHubStarsButton username="animate-ui" repo="animate-ui" variant="outline" value={1234} />
      <GitHubStarsButton username="animate-ui" repo="animate-ui" variant="ghost" value={1234} />
    </div>
  ),
}
