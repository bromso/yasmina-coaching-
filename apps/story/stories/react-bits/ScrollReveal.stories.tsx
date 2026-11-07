import ScrollReveal from "@repo/ui/components/ScrollReveal"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/ScrollReveal",
  component: ScrollReveal,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
      description: "Text content to reveal on scroll",
    },
    enableBlur: {
      control: { type: "boolean" },
      description: "Enable blur-to-sharp transition for each word",
    },
    baseOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Starting opacity of unrevealed words",
    },
    baseRotation: {
      control: { type: "range", min: 0, max: 10, step: 0.5 },
      description: "Initial rotation in degrees that animates to 0",
    },
    blurStrength: {
      control: { type: "range", min: 0, max: 20, step: 1 },
      description: "Blur amount in pixels for the blur effect",
    },
    rotationEnd: {
      control: { type: "text" },
      description: "ScrollTrigger end position for rotation animation",
    },
    wordAnimationEnd: {
      control: { type: "text" },
      description: "ScrollTrigger end position for word opacity/blur animation",
    },
    containerClassName: {
      control: { type: "text" },
      description: "CSS class for the outer container",
    },
    textClassName: {
      control: { type: "text" },
      description: "CSS class for the text paragraph",
    },
  },
  args: {
    children:
      "As you scroll down, each word in this sentence will gradually fade in and come into focus, creating a beautiful reading experience that guides your attention.",
    enableBlur: true,
    baseOpacity: 0.1,
    baseRotation: 3,
    blurStrength: 4,
    rotationEnd: "bottom bottom",
    wordAnimationEnd: "bottom bottom",
    textClassName: "text-white",
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "250vh", background: "#111", padding: "0 2rem" }}>
        <div
          style={{
            height: "80vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ color: "#666", fontSize: "1.5rem" }}>Scroll down to see the reveal effect</p>
        </div>
        <Story />
        <div style={{ height: "80vh" }} />
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollReveal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoBlur: Story = {
  args: {
    children:
      "This text reveals with opacity only, no blur effect applied to the individual words as they appear on screen.",
    enableBlur: false,
    baseOpacity: 0.05,
    baseRotation: 5,
    textClassName: "text-white",
  },
}
