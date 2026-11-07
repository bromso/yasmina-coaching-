import { NumberTicker } from "@repo/ui/components/number-ticker"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/NumberTicker",
  component: NumberTicker,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "number" },
    },
    startValue: {
      control: { type: "number" },
    },
    direction: {
      control: { type: "select" },
      options: ["up", "down"],
    },
    delay: {
      control: { type: "number", min: 0, max: 5, step: 0.1 },
    },
    decimalPlaces: {
      control: { type: "number", min: 0, max: 4, step: 1 },
    },
  },
  args: {
    value: 100,
    direction: "up",
    delay: 0,
    decimalPlaces: 0,
  },
} satisfies Meta<typeof NumberTicker>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "text-4xl font-bold",
  },
}

export const LargeNumber: Story = {
  args: {
    value: 9999,
    className: "text-4xl font-bold",
  },
}

export const WithDecimals: Story = {
  args: {
    value: 99.99,
    decimalPlaces: 2,
    className: "text-4xl font-bold",
  },
}

export const CountDown: Story = {
  args: {
    value: 0,
    startValue: 100,
    direction: "down",
    className: "text-4xl font-bold",
  },
}

export const DelayedStart: Story = {
  args: {
    value: 500,
    delay: 2,
    className: "text-4xl font-bold",
  },
}

export const CustomStartValue: Story = {
  args: {
    value: 1000,
    startValue: 500,
    className: "text-4xl font-bold",
  },
}

export const Percentage: Story = {
  render: (args) => (
    <div className="text-4xl font-bold">
      <NumberTicker {...args} />%
    </div>
  ),
  args: {
    value: 87,
    decimalPlaces: 1,
  },
}

export const Currency: Story = {
  render: (args) => (
    <div className="text-4xl font-bold">
      $<NumberTicker {...args} />
    </div>
  ),
  args: {
    value: 2499.99,
    decimalPlaces: 2,
  },
}
