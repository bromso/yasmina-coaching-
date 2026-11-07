import { Progress } from "@repo/ui/components/progress"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Feedback/Progress",
  component: Progress,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100 },
    },
  },
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: 60,
    className: "w-[300px]",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const progress = canvas.getByRole("progressbar")

    await expect(progress).toBeInTheDocument()
    // Verify the progress indicator has the correct transform
    const indicator = canvasElement.querySelector("[data-slot='progress-indicator']")
    await expect(indicator).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: {
    value: 0,
    className: "w-[300px]",
  },
}

export const Full: Story = {
  args: {
    value: 100,
    className: "w-[300px]",
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex w-[300px] flex-col gap-4">
      <Progress value={33} className="h-1" />
      <Progress value={33} className="h-2" />
      <Progress value={33} className="h-3" />
      <Progress value={33} className="h-4" />
    </div>
  ),
}

export const AllValues: Story = {
  render: () => (
    <div className="flex w-[300px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm">0%</span>
        <Progress value={0} className="flex-1" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm">25%</span>
        <Progress value={25} className="flex-1" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm">50%</span>
        <Progress value={50} className="flex-1" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm">75%</span>
        <Progress value={75} className="flex-1" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm">100%</span>
        <Progress value={100} className="flex-1" />
      </div>
    </div>
  ),
}
