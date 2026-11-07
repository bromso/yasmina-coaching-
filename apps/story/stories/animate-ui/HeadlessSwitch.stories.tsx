import { Switch } from "@repo/ui/components/animate-ui/components/headless/switch"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import React from "react"

const meta = {
  title: "Animate UI/Headless/Switch",
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
      <Switch id="headless-airplane" {...args} />
      <label htmlFor="headless-airplane" className="text-sm font-medium">
        Airplane Mode
      </label>
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <Switch startIcon={<Icon icon="lucide:sun" />} endIcon={<Icon icon="lucide:moon" />} />
  ),
}

export const Controlled: Story = {
  render: function ControlledSwitch() {
    const [checked, setChecked] = React.useState(false)

    return (
      <div className="flex items-center gap-4">
        {/* Switch's `onChange` type intersects Headless UI's `(checked: boolean)` handler with
            the button's change-event handler, so the handler takes either. Headless UI calls it
            with the new boolean. */}
        <Switch checked={checked} onChange={(value: unknown) => setChecked(value === true)} />
        <span className="text-sm text-muted-foreground">{checked ? "On" : "Off"}</span>
      </div>
    )
  },
}
