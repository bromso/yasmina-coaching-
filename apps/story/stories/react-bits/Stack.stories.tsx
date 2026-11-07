import Stack from "@repo/ui/components/Stack"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleCards = [
  <img
    key="1"
    src="https://picsum.photos/seed/stack1/400/400"
    alt="card 1"
    className="w-full h-full object-cover pointer-events-none"
  />,
  <img
    key="2"
    src="https://picsum.photos/seed/stack2/400/400"
    alt="card 2"
    className="w-full h-full object-cover pointer-events-none"
  />,
  <img
    key="3"
    src="https://picsum.photos/seed/stack3/400/400"
    alt="card 3"
    className="w-full h-full object-cover pointer-events-none"
  />,
  <img
    key="4"
    src="https://picsum.photos/seed/stack4/400/400"
    alt="card 4"
    className="w-full h-full object-cover pointer-events-none"
  />,
]

const meta = {
  title: "React Bits/Components/Stack",
  component: Stack,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    randomRotation: {
      control: "boolean",
      description: "Add random rotation to stacked cards",
    },
    sensitivity: {
      control: { type: "range", min: 50, max: 500, step: 25 },
      description: "Drag distance threshold to send card to back",
    },
    sendToBackOnClick: {
      control: "boolean",
      description: "Send top card to back on click",
    },
    autoplay: {
      control: "boolean",
      description: "Automatically cycle through cards",
    },
    autoplayDelay: {
      control: { type: "range", min: 1000, max: 8000, step: 500 },
      description: "Delay between auto-cycles in ms",
    },
    pauseOnHover: {
      control: "boolean",
      description: "Pause autoplay when hovered",
    },
  },
  args: {
    cards: sampleCards,
    randomRotation: false,
    sensitivity: 200,
    sendToBackOnClick: false,
    autoplay: false,
    autoplayDelay: 3000,
    pauseOnHover: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "300px", height: "300px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Stack>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Autoplay: Story = {
  args: {
    autoplay: true,
    autoplayDelay: 2000,
    pauseOnHover: true,
    randomRotation: true,
    sendToBackOnClick: true,
  },
}
