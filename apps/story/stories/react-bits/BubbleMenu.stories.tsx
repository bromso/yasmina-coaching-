import BubbleMenu from "@repo/ui/components/BubbleMenu"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/BubbleMenu",
  component: BubbleMenu,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    logo: {
      control: { type: "text" },
      description: "Logo content, either a string URL or ReactNode",
    },
    menuBg: {
      control: { type: "color" },
      description: "Background color of the menu bubbles",
    },
    menuContentColor: {
      control: { type: "color" },
      description: "Text/icon color of the menu",
    },
    useFixedPosition: {
      control: { type: "boolean" },
      description: "Use fixed positioning instead of absolute",
    },
    animationDuration: {
      control: { type: "number", min: 0.1, max: 2, step: 0.1 },
      description: "Duration of bubble animation in seconds",
    },
    staggerDelay: {
      control: { type: "number", min: 0, max: 0.5, step: 0.01 },
      description: "Stagger delay between each bubble",
    },
  },
  args: {
    logo: "ReactBits",
    menuBg: "#fff",
    menuContentColor: "#111",
    useFixedPosition: false,
    animationDuration: 0.5,
    staggerDelay: 0.12,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: "500px", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BubbleMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomColors: Story = {
  args: {
    menuBg: "#1a1a2e",
    menuContentColor: "#e0e0e0",
    items: [
      {
        label: "dashboard",
        href: "#",
        ariaLabel: "Dashboard",
        rotation: -8,
        hoverStyles: { bgColor: "#e94560", textColor: "#ffffff" },
      },
      {
        label: "settings",
        href: "#",
        ariaLabel: "Settings",
        rotation: 8,
        hoverStyles: { bgColor: "#0f3460", textColor: "#ffffff" },
      },
      {
        label: "profile",
        href: "#",
        ariaLabel: "Profile",
        rotation: -5,
        hoverStyles: { bgColor: "#533483", textColor: "#ffffff" },
      },
    ],
  },
}
