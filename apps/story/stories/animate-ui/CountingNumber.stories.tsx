import { CountingNumber } from "@repo/ui/components/animate-ui/primitives/texts/counting-number"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/CountingNumber",
  component: CountingNumber,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    number: {
      control: { type: "number", min: 0, max: 100000 },
    },
    fromNumber: {
      control: { type: "number", min: 0, max: 100000 },
    },
    padStart: {
      control: "boolean",
    },
    decimalPlaces: {
      control: { type: "number", min: 0, max: 4, step: 1 },
    },
    decimalSeparator: {
      control: "text",
    },
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
  },
  args: {
    number: 1000,
    fromNumber: 0,
    padStart: false,
    decimalPlaces: 0,
    decimalSeparator: ".",
    delay: 0,
  },
} satisfies Meta<typeof CountingNumber>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    number: 1234,
    className: "text-4xl font-bold tabular-nums",
  },
}

export const WithDecimals: Story = {
  args: {
    number: 99.95,
    decimalPlaces: 2,
    className: "text-4xl font-bold tabular-nums",
  },
}

export const PaddedNumber: Story = {
  args: {
    number: 42,
    padStart: true,
    className: "text-4xl font-bold tabular-nums",
  },
}

export const LargeNumber: Story = {
  args: {
    number: 50000,
    className: "text-5xl font-black tabular-nums",
  },
}

export const WithDelay: Story = {
  args: {
    number: 100,
    delay: 1000,
    className: "text-4xl font-bold tabular-nums",
  },
}

export const EuropeanDecimalSeparator: Story = {
  args: {
    number: 1234.56,
    decimalPlaces: 2,
    decimalSeparator: ",",
    className: "text-4xl font-bold tabular-nums",
  },
}

export const Percentage: Story = {
  render: (args) => (
    <div className="text-4xl font-bold tabular-nums">
      <CountingNumber {...args} />
      <span>%</span>
    </div>
  ),
  args: {
    number: 87,
    fromNumber: 0,
  },
}
