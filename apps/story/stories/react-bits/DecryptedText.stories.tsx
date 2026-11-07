import DecryptedText from "@repo/ui/components/DecryptedText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/DecryptedText",
  component: DecryptedText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "The text to decrypt/reveal",
    },
    speed: {
      control: { type: "range", min: 10, max: 200, step: 5 },
      description: "Speed of the scramble effect in ms",
    },
    maxIterations: {
      control: { type: "range", min: 1, max: 30, step: 1 },
      description: "Max scramble iterations before revealing (non-sequential mode)",
    },
    sequential: {
      control: { type: "boolean" },
      description: "Reveal characters one by one instead of all at once",
    },
    revealDirection: {
      control: { type: "select" },
      options: ["start", "end", "center"],
      description: "Direction from which characters are sequentially revealed",
    },
    useOriginalCharsOnly: {
      control: { type: "boolean" },
      description: "Only shuffle using the original characters from the text",
    },
    characters: {
      control: { type: "text" },
      description: "Character set used for scrambling",
    },
    animateOn: {
      control: { type: "select" },
      options: ["hover", "view", "both"],
      description: "Trigger for the decrypt animation",
    },
    className: {
      control: { type: "text" },
      description: "CSS class for revealed characters",
    },
    encryptedClassName: {
      control: { type: "text" },
      description: "CSS class for encrypted/scrambled characters",
    },
  },
  args: {
    text: "Hover to decrypt",
    speed: 50,
    maxIterations: 10,
    sequential: false,
    revealDirection: "start",
    useOriginalCharsOnly: false,
    animateOn: "hover",
    className: "text-4xl font-bold text-white",
    encryptedClassName: "text-4xl font-bold text-white/40",
  },
} satisfies Meta<typeof DecryptedText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Sequential: Story = {
  args: {
    text: "Sequential reveal",
    sequential: true,
    speed: 80,
    revealDirection: "start",
    className: "text-3xl font-mono text-green-400",
    encryptedClassName: "text-3xl font-mono text-green-400/30",
  },
}

export const AnimateOnView: Story = {
  args: {
    text: "Revealed on scroll into view",
    animateOn: "view",
    sequential: true,
    speed: 60,
    revealDirection: "center",
    className: "text-3xl font-bold text-white",
    encryptedClassName: "text-3xl font-bold text-white/20",
  },
}
