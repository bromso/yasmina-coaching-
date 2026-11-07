import {
  TypingText,
  TypingTextCursor,
} from "@repo/ui/components/animate-ui/primitives/texts/typing"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/Typing",
  component: TypingText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    duration: {
      control: { type: "number", min: 20, max: 500, step: 10 },
    },
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
    loop: {
      control: "boolean",
    },
    holdDelay: {
      control: { type: "number", min: 200, max: 5000, step: 100 },
    },
  },
  args: {
    // Every story passes its own `text`; this only satisfies the required prop.
    text: "Hello, World!",
    duration: 100,
    delay: 0,
    loop: false,
    holdDelay: 1000,
  },
} satisfies Meta<typeof TypingText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <span className="text-2xl font-semibold">
      <TypingText {...args} text="Hello, World!">
        <TypingTextCursor />
      </TypingText>
    </span>
  ),
}

export const MultipleTexts: Story = {
  render: (args) => (
    <span className="text-2xl font-semibold">
      <TypingText {...args} text={["Developer", "Designer", "Creator"]}>
        <TypingTextCursor />
      </TypingText>
    </span>
  ),
  args: {
    loop: true,
    holdDelay: 1500,
  },
}

export const SlowTyping: Story = {
  render: (args) => (
    <span className="text-lg">
      <TypingText {...args} text="This types slowly, one character at a time...">
        <TypingTextCursor />
      </TypingText>
    </span>
  ),
  args: {
    duration: 200,
  },
}

export const FastTyping: Story = {
  render: (args) => (
    <span className="text-lg">
      <TypingText {...args} text="This types very quickly!">
        <TypingTextCursor />
      </TypingText>
    </span>
  ),
  args: {
    duration: 30,
  },
}

export const WithDelay: Story = {
  render: (args) => (
    <span className="text-lg">
      <TypingText {...args} text="This starts after a 2 second delay.">
        <TypingTextCursor />
      </TypingText>
    </span>
  ),
  args: {
    delay: 2000,
  },
}
