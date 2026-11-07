import PrismaticBurst from "@repo/ui/components/PrismaticBurst"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/PrismaticBurst",
  component: PrismaticBurst,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs", "!test"],
  argTypes: {
    intensity: { control: { type: "range", min: 0.5, max: 5, step: 0.1 } },
    speed: { control: { type: "range", min: 0.1, max: 3, step: 0.1 } },
    animationType: { control: "select", options: ["rotate", "rotate3d", "hover"] },
    colors: { control: "object" },
    distort: { control: { type: "range", min: 0, max: 10, step: 0.5 } },
    paused: { control: "boolean" },
    hoverDampness: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    rayCount: { control: { type: "range", min: 0, max: 20, step: 1 } },
    mixBlendMode: {
      control: "select",
      options: ["none", "lighten", "screen", "multiply", "normal"],
    },
  },
  args: {
    intensity: 2,
    speed: 0.5,
    animationType: "rotate3d",
    distort: 0,
    paused: false,
    hoverDampness: 0,
    mixBlendMode: "lighten",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PrismaticBurst>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomColors: Story = {
  args: {
    colors: ["#ff0066", "#00ccff", "#ffcc00"],
    rayCount: 8,
    distort: 3,
    intensity: 2.5,
  },
}
