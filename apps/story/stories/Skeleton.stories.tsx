import { Skeleton } from "@repo/ui/components/skeleton"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

const meta = {
  title: "Components/Feedback/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "h-4 w-[250px]",
  },
  play: async ({ canvasElement }) => {
    // Skeleton has no semantic role, query by data-slot attribute
    const skeleton = canvasElement.querySelector("[data-slot='skeleton']")
    await expect(skeleton).toBeInTheDocument()
  },
}

export const Circle: Story = {
  args: {
    className: "size-12 rounded-full",
  },
}

export const Card: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
}

export const TextBlock: Story = {
  render: () => (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
}

export const ImageWithText: Story = {
  render: () => (
    <div className="w-[300px] space-y-4">
      <Skeleton className="h-[200px] w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  ),
}

export const Table: Story = {
  render: () => (
    <div className="w-[400px] space-y-3">
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
    </div>
  ),
}
