import ScrollFloat from "@repo/ui/components/ScrollFloat"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/ScrollFloat",
  component: ScrollFloat,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
      description: "Text content to animate on scroll",
    },
    animationDuration: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
      description: "Duration of the animation in seconds",
    },
    ease: {
      control: { type: "text" },
      description: "GSAP easing function string",
    },
    scrollStart: {
      control: { type: "text" },
      description: "ScrollTrigger start position",
    },
    scrollEnd: {
      control: { type: "text" },
      description: "ScrollTrigger end position",
    },
    stagger: {
      control: { type: "range", min: 0, max: 0.2, step: 0.005 },
      description: "Stagger delay between each character animation",
    },
    containerClassName: {
      control: { type: "text" },
      description: "CSS class for the outer h2 container",
    },
    textClassName: {
      control: { type: "text" },
      description: "CSS class for the inner text span",
    },
  },
  args: {
    children: "Scroll down to see this text float into view",
    animationDuration: 1,
    ease: "back.inOut(2)",
    scrollStart: "center bottom+=50%",
    scrollEnd: "bottom bottom-=40%",
    stagger: 0.03,
    textClassName: "text-white font-bold",
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
          <p style={{ color: "#666", fontSize: "1.5rem" }}>Scroll down to see the effect</p>
        </div>
        <Story />
        <div style={{ height: "80vh" }} />
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollFloat>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FastAnimation: Story = {
  args: {
    children: "Quick float animation with tight timing",
    animationDuration: 0.4,
    stagger: 0.01,
    textClassName: "text-white font-black",
  },
}
