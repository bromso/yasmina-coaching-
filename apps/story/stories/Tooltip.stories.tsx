import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/tooltip"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delayDuration: {
      control: { type: "number", min: 0, max: 2000 },
      description: "Duration in ms before the tooltip opens (default: 700)",
    },
    disableHoverableContent: {
      control: "boolean",
      description: "Prevents tooltip from remaining open when hovering over content",
    },
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Add to library</p>
      </TooltipContent>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /hover me/i })

    await expect(trigger).toBeInTheDocument()
    await userEvent.hover(trigger)

    const tooltip = await within(document.body).findByRole("tooltip")
    await expect(tooltip).toBeInTheDocument()
    await expect(within(tooltip).getByText("Add to library")).toBeInTheDocument()
  },
}

export const WithIcon: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Add new item">
          <Icon icon="lucide:plus" className="size-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Add new item</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const HelpIcon: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <span>Password</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Password help">
            <Icon
              icon="lucide:help-circle"
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Password must be at least 8 characters</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}

export const Positions: Story = {
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Top</Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Tooltip on top</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Right</Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Tooltip on right</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Tooltip on bottom</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Left</Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Tooltip on left</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}
