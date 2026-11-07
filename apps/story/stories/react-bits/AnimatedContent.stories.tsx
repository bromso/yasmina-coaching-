import AnimatedContent from "@repo/ui/components/AnimatedContent"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/AnimatedContent",
  component: AnimatedContent,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    distance: {
      control: { type: "range", min: 0, max: 300, step: 10 },
      description: "Distance in pixels the element travels during animation",
    },
    direction: {
      control: { type: "select" },
      options: ["vertical", "horizontal"],
      description: "Direction of the slide-in animation",
    },
    reverse: {
      control: { type: "boolean" },
      description: "Reverse the animation direction",
    },
    duration: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
      description: "Duration of the animation in seconds",
    },
    ease: {
      control: { type: "text" },
      description: "GSAP easing function string",
    },
    initialOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "Initial opacity before animation",
    },
    animateOpacity: {
      control: { type: "boolean" },
      description: "Whether to animate opacity alongside movement",
    },
    scale: {
      control: { type: "range", min: 0.1, max: 2, step: 0.1 },
      description: "Initial scale of the element",
    },
    threshold: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "ScrollTrigger visibility threshold (0-1)",
    },
    delay: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Delay before animation starts in seconds",
    },
  },
  args: {
    distance: 100,
    direction: "vertical",
    reverse: false,
    duration: 0.8,
    ease: "power3.out",
    initialOpacity: 0,
    animateOpacity: true,
    scale: 1,
    threshold: 0.1,
    delay: 0,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400, minHeight: 300, display: "grid", placeItems: "center" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnimatedContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <div
        style={{
          padding: 32,
          background: "#1a1a2e",
          borderRadius: 12,
          color: "white",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24 }}>Animated Content</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.7 }}>Scroll-triggered animation</p>
      </div>
    ),
  },
}

export const HorizontalSlide: Story = {
  args: {
    direction: "horizontal",
    distance: 150,
    children: (
      <div
        style={{
          padding: 32,
          background: "#16213e",
          borderRadius: 12,
          color: "white",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24 }}>Horizontal Slide</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.7 }}>Slides in from the side</p>
      </div>
    ),
  },
}
