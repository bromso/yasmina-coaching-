import {
  ScrollingNumber,
  ScrollingNumberContainer,
  ScrollingNumberHighlight,
  ScrollingNumberItems,
} from "@repo/ui/components/animate-ui/primitives/texts/scrolling-number"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/ScrollingNumber",
  component: ScrollingNumberContainer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    number: {
      control: { type: "number", min: 0, max: 10000, step: 10 },
    },
    step: {
      control: { type: "number", min: 1, max: 100, step: 1 },
    },
    itemsSize: {
      control: { type: "number", min: 20, max: 60, step: 5 },
    },
    sideItemsCount: {
      control: { type: "number", min: 1, max: 5, step: 1 },
    },
    direction: {
      control: "select",
      options: ["btt", "ttb", "ltr", "rtl"],
    },
  },
  args: {
    number: 100,
    step: 10,
    itemsSize: 30,
    sideItemsCount: 2,
    direction: "btt",
  },
} satisfies Meta<typeof ScrollingNumberContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <ScrollingNumberContainer {...args} className="w-16 text-center">
      <ScrollingNumberHighlight className="w-full rounded bg-primary/20" />
      <ScrollingNumber>
        <ScrollingNumberItems className="flex items-center justify-center text-sm font-medium" />
      </ScrollingNumber>
    </ScrollingNumberContainer>
  ),
}

export const LargeNumber: Story = {
  render: (args) => (
    <ScrollingNumberContainer {...args} className="w-20 text-center">
      <ScrollingNumberHighlight className="w-full rounded bg-primary/20" />
      <ScrollingNumber>
        <ScrollingNumberItems className="flex items-center justify-center text-lg font-bold" />
      </ScrollingNumber>
    </ScrollingNumberContainer>
  ),
  args: {
    number: 500,
    step: 50,
    itemsSize: 40,
  },
}

export const Horizontal: Story = {
  render: (args) => (
    <ScrollingNumberContainer {...args} className="h-10 text-center">
      <ScrollingNumberHighlight className="h-full rounded bg-primary/20" />
      <ScrollingNumber>
        <ScrollingNumberItems className="flex items-center justify-center text-sm font-medium" />
      </ScrollingNumber>
    </ScrollingNumberContainer>
  ),
  args: {
    direction: "ltr",
    number: 50,
    step: 5,
    itemsSize: 40,
  },
}

export const SmallStep: Story = {
  render: (args) => (
    <ScrollingNumberContainer {...args} className="w-12 text-center">
      <ScrollingNumberHighlight className="w-full rounded bg-muted" />
      <ScrollingNumber>
        <ScrollingNumberItems className="flex items-center justify-center text-sm font-mono" />
      </ScrollingNumber>
    </ScrollingNumberContainer>
  ),
  args: {
    number: 20,
    step: 1,
    sideItemsCount: 3,
  },
}
