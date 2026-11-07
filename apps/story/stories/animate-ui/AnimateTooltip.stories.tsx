import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/animate-ui/components/animate/tooltip"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>This is an animated tooltip</TooltipContent>
    </Tooltip>
  ),
}

export const TopSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Top tooltip</Button>
      </TooltipTrigger>
      <TooltipContent>Appears on top</TooltipContent>
    </Tooltip>
  ),
}

export const WithLongContent: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Detailed info</Button>
      </TooltipTrigger>
      <TooltipContent>
        This tooltip has more content to demonstrate how it handles longer text with the animated
        layout transition.
      </TooltipContent>
    </Tooltip>
  ),
}

export const MultipleTooltips: Story = {
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            A
          </Button>
        </TooltipTrigger>
        <TooltipContent>First</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            B
          </Button>
        </TooltipTrigger>
        <TooltipContent>Second tooltip here</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            C
          </Button>
        </TooltipTrigger>
        <TooltipContent>Third</TooltipContent>
      </Tooltip>
    </div>
  ),
}
