import { Button } from "@repo/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Surfaces/Collapsible",
  component: Collapsible,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
      description: "Whether the collapsible is disabled",
    },
    defaultOpen: {
      control: "boolean",
      description: "Whether the collapsible is open by default",
    },
  },
} satisfies Meta<typeof Collapsible>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = React.useState(false)

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-[350px] space-y-2">
        <div className="flex items-center justify-between space-x-4 px-4">
          <h4 className="text-sm font-semibold">@peduarte starred 3 repositories</h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              <Icon icon="lucide:chevrons-up-down" className="size-4" aria-hidden="true" />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-4 py-2 font-mono text-sm shadow-sm">
          @radix-ui/primitives
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border px-4 py-2 font-mono text-sm shadow-sm">
            @radix-ui/colors
          </div>
          <div className="rounded-md border px-4 py-2 font-mono text-sm shadow-sm">
            @stitches/react
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  },
}

export const DefaultOpen: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-[350px] space-y-2">
      <div className="flex items-center justify-between space-x-4 px-4">
        <h4 className="text-sm font-semibold">Settings</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            <Icon icon="lucide:chevrons-up-down" className="size-4" aria-hidden="true" />
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        <div className="rounded-md border px-4 py-2 text-sm">General Settings</div>
        <div className="rounded-md border px-4 py-2 text-sm">Privacy Settings</div>
        <div className="rounded-md border px-4 py-2 text-sm">Notification Settings</div>
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const Simple: Story = {
  render: () => (
    <Collapsible className="w-[300px]">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Click to expand
          <Icon icon="lucide:chevron-down" className="size-4" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="rounded-md border p-4">
          <p className="text-sm">This is the collapsible content that appears when expanded.</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /click to expand/i })

    await expect(trigger).toBeInTheDocument()
    await userEvent.click(trigger)

    await expect(canvas.getByText(/collapsible content that appears/i)).toBeVisible()
  },
}
