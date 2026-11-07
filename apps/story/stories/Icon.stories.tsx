import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor } from "storybook/test"

const meta = {
  title: "Components/Data Display/Icon",
  component: Icon,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    icon: {
      control: "text",
      description: "Iconify icon name (e.g., 'lucide:home', 'mdi:account')",
    },
  },
  args: {
    // Stories with their own `render` ignore this; it only satisfies the required prop.
    icon: "lucide:home",
  },
} satisfies Meta<typeof Icon>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    icon: "lucide:home",
    "aria-hidden": true,
  },
  play: async ({ canvasElement }) => {
    // Icon component renders via Iconify which loads asynchronously
    // Wait for the SVG to appear
    await waitFor(() => {
      const icon = canvasElement.querySelector("svg")
      expect(icon).toBeInTheDocument()
    })
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Icon icon="lucide:star" className="size-3" aria-hidden="true" />
      <Icon icon="lucide:star" className="size-4" aria-hidden="true" />
      <Icon icon="lucide:star" className="size-5" aria-hidden="true" />
      <Icon icon="lucide:star" className="size-6" aria-hidden="true" />
      <Icon icon="lucide:star" className="size-8" aria-hidden="true" />
      <Icon icon="lucide:star" className="size-10" aria-hidden="true" />
    </div>
  ),
}

export const Colors: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Icon icon="lucide:heart" className="text-red-500" aria-hidden="true" />
      <Icon icon="lucide:check-circle" className="text-green-500" aria-hidden="true" />
      <Icon icon="lucide:alert-triangle" className="text-yellow-500" aria-hidden="true" />
      <Icon icon="lucide:info" className="text-blue-500" aria-hidden="true" />
      <Icon icon="lucide:x-circle" className="text-destructive" aria-hidden="true" />
    </div>
  ),
}

export const CommonIcons: Story = {
  render: () => (
    <div className="grid grid-cols-6 gap-4">
      <Icon icon="lucide:home" aria-hidden="true" />
      <Icon icon="lucide:settings" aria-hidden="true" />
      <Icon icon="lucide:user" aria-hidden="true" />
      <Icon icon="lucide:mail" aria-hidden="true" />
      <Icon icon="lucide:bell" aria-hidden="true" />
      <Icon icon="lucide:search" aria-hidden="true" />
      <Icon icon="lucide:plus" aria-hidden="true" />
      <Icon icon="lucide:minus" aria-hidden="true" />
      <Icon icon="lucide:x" aria-hidden="true" />
      <Icon icon="lucide:check" aria-hidden="true" />
      <Icon icon="lucide:edit" aria-hidden="true" />
      <Icon icon="lucide:trash" aria-hidden="true" />
      <Icon icon="lucide:download" aria-hidden="true" />
      <Icon icon="lucide:upload" aria-hidden="true" />
      <Icon icon="lucide:share" aria-hidden="true" />
      <Icon icon="lucide:copy" aria-hidden="true" />
      <Icon icon="lucide:folder" aria-hidden="true" />
      <Icon icon="lucide:file" aria-hidden="true" />
    </div>
  ),
}

export const Arrows: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Icon icon="lucide:arrow-up" aria-hidden="true" />
      <Icon icon="lucide:arrow-down" aria-hidden="true" />
      <Icon icon="lucide:arrow-left" aria-hidden="true" />
      <Icon icon="lucide:arrow-right" aria-hidden="true" />
      <Icon icon="lucide:chevron-up" aria-hidden="true" />
      <Icon icon="lucide:chevron-down" aria-hidden="true" />
      <Icon icon="lucide:chevron-left" aria-hidden="true" />
      <Icon icon="lucide:chevron-right" aria-hidden="true" />
    </div>
  ),
}

export const Social: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Icon icon="lucide:github" aria-hidden="true" />
      <Icon icon="lucide:twitter" aria-hidden="true" />
      <Icon icon="lucide:linkedin" aria-hidden="true" />
      <Icon icon="lucide:facebook" aria-hidden="true" />
      <Icon icon="lucide:instagram" aria-hidden="true" />
      <Icon icon="lucide:youtube" aria-hidden="true" />
    </div>
  ),
}

export const WithText: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:calendar" aria-hidden="true" />
        <span className="text-sm">Calendar</span>
      </div>
      <div className="flex items-center gap-2">
        <Icon icon="lucide:clock" aria-hidden="true" />
        <span className="text-sm">Schedule</span>
      </div>
      <div className="flex items-center gap-2">
        <Icon icon="lucide:map-pin" aria-hidden="true" />
        <span className="text-sm">Location</span>
      </div>
    </div>
  ),
}
