import { Spinner } from "@repo/ui/components/spinner"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor } from "storybook/test"

const meta = {
  title: "Components/Feedback/Spinner",
  component: Spinner,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    // Iconify renders async, wait for the SVG to appear
    await waitFor(() => {
      const spinner = canvasElement.querySelector("svg")
      expect(spinner).toBeInTheDocument()
    })
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner className="size-4" />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
      <Spinner className="size-10" />
      <Spinner className="size-12" />
    </div>
  ),
}

export const WithText: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Spinner className="size-4" />
      <span className="text-sm">Loading...</span>
    </div>
  ),
}

export const InButton: Story = {
  render: () => (
    <button
      type="button"
      disabled
      className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium opacity-50"
    >
      <Spinner className="size-4" />
      Please wait
    </button>
  ),
}

export const Centered: Story = {
  render: () => (
    <div className="flex h-32 w-64 items-center justify-center rounded-md border">
      <Spinner className="size-8" />
    </div>
  ),
}
