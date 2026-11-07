import { IconButton } from "@repo/ui/components/animate-ui/components/buttons/icon"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Buttons/IconButton",
  component: IconButton,
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
    disabled: {
      control: "boolean",
    },
  },
  args: {
    variant: "default",
    size: "default",
    children: <Icon icon="lucide:heart" className="size-4" />,
  },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Star_: Story = {
  name: "Star",
  args: {
    children: <Icon icon="lucide:star" className="size-4" />,
    variant: "outline",
  },
}

export const ThumbsUp_: Story = {
  name: "ThumbsUp",
  args: {
    children: <Icon icon="lucide:thumbs-up" className="size-4" />,
    variant: "secondary",
  },
}

export const Bookmark_: Story = {
  name: "Bookmark",
  args: {
    children: <Icon icon="lucide:bookmark" className="size-4" />,
    variant: "ghost",
  },
}

export const Destructive: Story = {
  args: {
    children: <Icon icon="lucide:heart" className="size-4" />,
    variant: "destructive",
  },
}

export const ExtraSmall: Story = {
  args: {
    size: "xs",
    children: <Icon icon="lucide:heart" className="size-3.5" />,
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    children: <Icon icon="lucide:heart" className="size-4" />,
  },
}

export const Large: Story = {
  args: {
    size: "lg",
    children: <Icon icon="lucide:heart" className="size-5" />,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <IconButton variant="default">
        <Icon icon="lucide:heart" className="size-4" />
      </IconButton>
      <IconButton variant="accent">
        <Icon icon="lucide:star" className="size-4" />
      </IconButton>
      <IconButton variant="destructive">
        <Icon icon="lucide:heart" className="size-4" />
      </IconButton>
      <IconButton variant="outline">
        <Icon icon="lucide:bell" className="size-4" />
      </IconButton>
      <IconButton variant="secondary">
        <Icon icon="lucide:thumbs-up" className="size-4" />
      </IconButton>
      <IconButton variant="ghost">
        <Icon icon="lucide:bookmark" className="size-4" />
      </IconButton>
    </div>
  ),
}
