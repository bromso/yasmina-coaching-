import { Switch } from "@repo/ui/components/animate-ui/components/radix/switch"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
    defaultChecked: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
}

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch id="airplane-mode" {...args} />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
}

export const FormExample: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-8">
        <div>
          <Label htmlFor="notifications" className="text-sm font-medium">
            Notifications
          </Label>
          <p className="text-xs text-muted-foreground">Receive email notifications</p>
        </div>
        <Switch id="notifications" defaultChecked />
      </div>
      <div className="flex items-center justify-between gap-8">
        <div>
          <Label htmlFor="marketing" className="text-sm font-medium">
            Marketing emails
          </Label>
          <p className="text-xs text-muted-foreground">Receive marketing updates</p>
        </div>
        <Switch id="marketing" />
      </div>
      <div className="flex items-center justify-between gap-8">
        <div>
          <Label htmlFor="security" className="text-sm font-medium">
            Security alerts
          </Label>
          <p className="text-xs text-muted-foreground">Get notified about security events</p>
        </div>
        <Switch id="security" defaultChecked />
      </div>
    </div>
  ),
}
