import { Checkbox } from "@repo/ui/components/animate-ui/components/base/checkbox"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "accent"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
    },
    disabled: {
      control: "boolean",
    },
    defaultChecked: {
      control: "boolean",
    },
  },
  args: {
    variant: "default",
    size: "default",
  },
} satisfies Meta<typeof Checkbox>

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

export const AccentVariant: Story = {
  args: {
    variant: "accent",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    defaultChecked: true,
  },
}

export const Large: Story = {
  args: {
    size: "lg",
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
      <Checkbox id="base-terms" {...args} />
      <label
        htmlFor="base-terms"
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        Accept terms and conditions
      </label>
    </div>
  ),
}
