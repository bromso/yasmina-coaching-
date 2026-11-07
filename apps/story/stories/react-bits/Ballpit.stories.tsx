import Ballpit from "@repo/ui/components/Ballpit"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Ballpit",
  component: Ballpit,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    followCursor: {
      control: "boolean",
      description: "Whether the main sphere follows the cursor",
    },
    count: {
      control: { type: "range", min: 10, max: 500, step: 10 },
      description: "Number of spheres",
    },
    gravity: {
      control: { type: "range", min: 0, max: 2, step: 0.1 },
      description: "Gravity strength",
    },
    size0: {
      control: { type: "range", min: 0.5, max: 3, step: 0.1 },
      description: "Size of the main sphere",
    },
  },
  args: {
    followCursor: true,
    count: 200,
    gravity: 0.5,
    size0: 1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Ballpit>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoCursorFollow: Story = {
  args: {
    followCursor: false,
    count: 100,
    gravity: 0.3,
  },
}
