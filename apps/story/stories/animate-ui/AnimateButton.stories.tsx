import { Button } from "@repo/ui/components/animate-ui/components/buttons/button"
import { Icon as IconifyIcon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Buttons/Button",
  component: Button,
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
      options: ["default", "sm", "lg", "icon", "icon-sm", "icon-lg"],
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    variant: "default",
    size: "default",
    children: "Animate Button",
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Accent: Story = {
  args: {
    variant: "accent",
    children: "Accent",
  },
}

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete",
  },
}

export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Outline",
  },
}

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
}

export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost",
  },
}

export const Link: Story = {
  args: {
    variant: "link",
    children: "Link Button",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    children: "Small",
  },
}

export const Large: Story = {
  args: {
    size: "lg",
    children: "Large",
  },
}

export const Icon: Story = {
  args: {
    size: "icon",
    children: <IconifyIcon icon="lucide:heart" className="size-4" />,
  },
}

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <IconifyIcon icon="lucide:mail" className="size-4" />
        Send Email
      </>
    ),
  },
}

export const WithTrailingIcon: Story = {
  args: {
    children: (
      <>
        Continue
        <IconifyIcon icon="lucide:arrow-right" className="size-4" />
      </>
    ),
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Default</Button>
      <Button variant="accent">Accent</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
}
