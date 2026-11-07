import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/animate-ui/components/radix/popover"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Popover",
  component: Popover,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Dimensions</h4>
            <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="width">Width</Label>
              <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="height">Height</Label>
              <Input id="height" defaultValue="25px" className="col-span-2 h-8" />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const WithCloseButton: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-4">
          <p className="text-sm">This popover has a close button inside.</p>
          <PopoverClose asChild>
            <Button size="sm">Close</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const SimpleText: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          Info
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <p className="text-sm text-muted-foreground">
          This is a simple informational popover with just text content.
        </p>
      </PopoverContent>
    </Popover>
  ),
}
