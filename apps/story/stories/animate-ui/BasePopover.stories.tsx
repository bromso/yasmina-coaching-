import {
  Popover,
  PopoverPanel,
  PopoverTrigger,
} from "@repo/ui/components/animate-ui/components/base/popover"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Popover",
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
      <PopoverTrigger render={<Button variant="outline" />}>Open Popover</PopoverTrigger>
      <PopoverPanel>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Dimensions</h4>
            <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <label className="text-sm" htmlFor="width">
                Width
              </label>
              <input
                id="width"
                defaultValue="100%"
                className="col-span-2 h-8 rounded-md border px-3 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <label className="text-sm" htmlFor="height">
                Height
              </label>
              <input
                id="height"
                defaultValue="25px"
                className="col-span-2 h-8 rounded-md border px-3 text-sm"
              />
            </div>
          </div>
        </div>
      </PopoverPanel>
    </Popover>
  ),
}

export const SimpleContent: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>Info</PopoverTrigger>
      <PopoverPanel>
        <p className="text-sm">This is a simple popover with text content.</p>
      </PopoverPanel>
    </Popover>
  ),
}
