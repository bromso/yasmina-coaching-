import { SlidingNumber } from "@repo/ui/components/animate-ui/primitives/texts/sliding-number"
import type { Meta, StoryObj } from "@storybook/react-vite"
import React from "react"

const meta = {
  title: "Animate UI/Texts/SlidingNumber",
  component: SlidingNumber,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    number: {
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
    thousandSeparator: {
      control: "text",
    },
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
  },
  args: {
    number: 1234,
    padStart: false,
    decimalPlaces: 0,
    decimalSeparator: ".",
    delay: 0,
  },
} satisfies Meta<typeof SlidingNumber>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    number: 1234,
    className: "text-4xl font-bold",
  },
}

export const WithDecimals: Story = {
  args: {
    number: 42.99,
    decimalPlaces: 2,
    className: "text-4xl font-bold",
  },
}

export const WithThousandSeparator: Story = {
  args: {
    number: 12345,
    thousandSeparator: ",",
    className: "text-4xl font-bold",
  },
}

export const PaddedNumber: Story = {
  args: {
    number: 7,
    padStart: true,
    className: "text-4xl font-bold",
  },
}

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = React.useState(0)

    return (
      <div className="flex flex-col items-center gap-4">
        <SlidingNumber number={value} className="text-5xl font-black" />
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => setValue((v) => v + 1)}
          >
            +1
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => setValue((v) => v + 10)}
          >
            +10
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => setValue((v) => v + 100)}
          >
            +100
          </button>
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm"
            onClick={() => setValue(0)}
          >
            Reset
          </button>
        </div>
      </div>
    )
  },
}

export const Price: Story = {
  render: (args) => (
    <div className="text-4xl font-bold">
      <span>$</span>
      <SlidingNumber {...args} />
    </div>
  ),
  args: {
    number: 99.99,
    decimalPlaces: 2,
    thousandSeparator: ",",
  },
}
