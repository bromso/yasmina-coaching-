import {
  Tooltip,
  TooltipPanel,
  TooltipTrigger,
} from "@repo/ui/components/animate-ui/components/base/tooltip"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Animate UI/Base/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
      <TooltipPanel>This is a tooltip</TooltipPanel>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.hover(within(canvasElement).getByRole("button", { name: "Hover me" }))
    // The wrapper's provider delay is 0: well under Base UI's 600 ms default, so a lost delay fails.
    await waitFor(() => expect(body.getByText("This is a tooltip")).toBeVisible(), { timeout: 400 })
  },
}

export const TopSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Top</TooltipTrigger>
      <TooltipPanel side="top">Tooltip on top</TooltipPanel>
    </Tooltip>
  ),
}

export const BottomSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Bottom</TooltipTrigger>
      <TooltipPanel side="bottom">Tooltip on bottom</TooltipPanel>
    </Tooltip>
  ),
}

export const LeftSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Left</TooltipTrigger>
      <TooltipPanel side="left">Tooltip on left</TooltipPanel>
    </Tooltip>
  ),
}

export const RightSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Right</TooltipTrigger>
      <TooltipPanel side="right">Tooltip on right</TooltipPanel>
    </Tooltip>
  ),
}

export const LongContent: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Help</TooltipTrigger>
      <TooltipPanel>
        This is a longer tooltip that wraps across multiple lines to provide additional context
      </TooltipPanel>
    </Tooltip>
  ),
}
