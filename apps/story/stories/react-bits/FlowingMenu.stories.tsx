import FlowingMenu from "@repo/ui/components/FlowingMenu"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleItems = [
  {
    link: "#",
    text: "Home",
    image: "https://picsum.photos/seed/fm1/600/400",
  },
  {
    link: "#",
    text: "About",
    image: "https://picsum.photos/seed/fm2/600/400",
  },
  {
    link: "#",
    text: "Projects",
    image: "https://picsum.photos/seed/fm3/600/400",
  },
  {
    link: "#",
    text: "Contact",
    image: "https://picsum.photos/seed/fm4/600/400",
  },
]

const meta = {
  title: "React Bits/Components/FlowingMenu",
  component: FlowingMenu,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    speed: {
      control: { type: "number", min: 5, max: 40, step: 1 },
      description: "Marquee scroll speed (lower = faster)",
    },
    textColor: {
      control: { type: "color" },
      description: "Color of menu item text",
    },
    bgColor: {
      control: { type: "color" },
      description: "Background color of the menu",
    },
    marqueeBgColor: {
      control: { type: "color" },
      description: "Background color of the hover marquee",
    },
    marqueeTextColor: {
      control: { type: "color" },
      description: "Text color of the hover marquee",
    },
    borderColor: {
      control: { type: "color" },
      description: "Color of the border between items",
    },
  },
  args: {
    items: sampleItems,
    speed: 15,
    textColor: "#fff",
    bgColor: "#060010",
    marqueeBgColor: "#fff",
    marqueeTextColor: "#060010",
    borderColor: "#fff",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "600px", height: "400px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FlowingMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomColors: Story = {
  args: {
    bgColor: "#1a1a2e",
    textColor: "#e0e0e0",
    marqueeBgColor: "#e94560",
    marqueeTextColor: "#ffffff",
    borderColor: "#333",
  },
}
