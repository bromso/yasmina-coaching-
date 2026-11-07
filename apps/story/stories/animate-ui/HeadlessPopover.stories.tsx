import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@repo/ui/components/animate-ui/components/headless/popover"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Headless/Popover",
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
      <PopoverButton as={Button} variant="outline">
        Open Popover
      </PopoverButton>
      <PopoverPanel>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Settings</h4>
            <p className="text-sm text-muted-foreground">Manage your notification preferences.</p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Email notifications</span>
              <span className="text-sm text-muted-foreground">Enabled</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Push notifications</span>
              <span className="text-sm text-muted-foreground">Disabled</span>
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
      <PopoverButton as={Button} variant="outline">
        Info
      </PopoverButton>
      <PopoverPanel>
        <p className="text-sm">This is a simple popover with text content.</p>
      </PopoverPanel>
    </Popover>
  ),
}

export const TopAnchor: Story = {
  render: () => (
    <div className="pt-48">
      <Popover>
        <PopoverButton as={Button} variant="outline">
          Open above
        </PopoverButton>
        <PopoverPanel anchor={{ to: "top", gap: 4 }}>
          <p className="text-sm">This popover appears above the trigger.</p>
        </PopoverPanel>
      </Popover>
    </div>
  ),
}
