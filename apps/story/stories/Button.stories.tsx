import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, within } from "storybook/test"

/** Every size is a pill (`rounded-full`), www's shape; the default is the charcoal `--primary`. */
const meta = {
  title: "Components/Inputs/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onClick: fn(),
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
    },
    disabled: {
      control: "boolean",
    },
    asChild: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Button",
    variant: "default",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole("button", { name: /button/i })

    await expect(button).toBeInTheDocument()
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalled()
  },
}

export const Secondary: Story = {
  args: {
    children: "Secondary",
    variant: "secondary",
  },
}

export const Destructive: Story = {
  args: {
    children: "Destructive",
    variant: "destructive",
  },
}

export const Outline: Story = {
  args: {
    children: "Outline",
    variant: "outline",
  },
}

export const Ghost: Story = {
  args: {
    children: "Ghost",
    variant: "ghost",
  },
}

export const Link: Story = {
  args: {
    children: "Link",
    variant: "link",
  },
}

export const Small: Story = {
  args: {
    children: "Small",
    size: "sm",
  },
}

export const Large: Story = {
  args: {
    children: "Large",
    size: "lg",
  },
}

export const IconButton: Story = {
  args: {
    size: "icon",
    "aria-label": "Send email",
    children: <Icon icon="lucide:mail" className="size-4" aria-hidden="true" />,
  },
}

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Icon icon="lucide:mail" className="size-4" aria-hidden="true" />
        Login with Email
      </>
    ),
  },
}

export const Loading: Story = {
  args: {
    disabled: true,
    children: (
      <>
        <Icon icon="lucide:loader-2" className="size-4 animate-spin" aria-hidden="true" />
        Please wait
      </>
    ),
  },
}

export const WithTrailingIcon: Story = {
  args: {
    children: (
      <>
        Next
        <Icon icon="lucide:chevron-right" className="size-4" aria-hidden="true" />
      </>
    ),
  },
}

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole("button", { name: /disabled/i })

    await expect(button).toBeDisabled()
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Send email">
        <Icon icon="lucide:mail" className="size-4" aria-hidden="true" />
      </Button>
    </div>
  ),
}

/** www's call to action: `lg` at 48 px with the larger text, next to an outline secondary. */
export const CallToAction: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg" className="h-12 px-6 text-base">
        <a href="#book">Boka ett samtal</a>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
        <a href="#more">Läs mer</a>
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "Boka ett samtal" })
    // A pill: every corner's radius reaches half the height.
    const half = link.getBoundingClientRect().height / 2
    const style = getComputedStyle(link)
    for (const radius of [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomLeftRadius,
      style.borderBottomRightRadius,
    ]) {
      await expect(Number.parseFloat(radius)).toBeGreaterThanOrEqual(half)
    }
  },
}
