import { StaggeredMenu } from "@repo/ui/components/StaggeredMenu"
import type { Meta, StoryObj } from "@storybook/react-vite"

const menuItems = [
  { label: "Home", ariaLabel: "Go to Home", link: "#" },
  { label: "Work", ariaLabel: "Go to Work", link: "#" },
  { label: "About", ariaLabel: "Go to About", link: "#" },
  { label: "Contact", ariaLabel: "Go to Contact", link: "#" },
]

const socialItems = [
  { label: "Twitter", link: "#" },
  { label: "GitHub", link: "#" },
  { label: "LinkedIn", link: "#" },
  { label: "Dribbble", link: "#" },
]

const meta = {
  title: "React Bits/Components/StaggeredMenu",
  component: StaggeredMenu,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    position: {
      control: "select",
      options: ["left", "right"],
      description: "Side from which the menu panel slides in",
    },
    isFixed: {
      control: "boolean",
      description: "Use fixed positioning for full-screen overlay",
    },
    displaySocials: {
      control: "boolean",
      description: "Show the social links section",
    },
    displayItemNumbering: {
      control: "boolean",
      description: "Show numbered index for each menu item",
    },
    menuButtonColor: {
      control: "color",
      description: "Color of the menu toggle button (closed)",
    },
    openMenuButtonColor: {
      control: "color",
      description: "Color of the menu toggle button (open)",
    },
    accentColor: {
      control: "color",
      description: "Accent color for numbering and social headings",
    },
    changeMenuColorOnOpen: {
      control: "boolean",
      description: "Animate button color when menu opens/closes",
    },
    closeOnClickAway: {
      control: "boolean",
      description: "Close menu when clicking outside",
    },
  },
  args: {
    items: menuItems,
    socialItems: socialItems,
    position: "right",
    isFixed: false,
    displaySocials: true,
    displayItemNumbering: true,
    colors: ["#B19EEF", "#5227FF"],
    menuButtonColor: "#ffffff",
    openMenuButtonColor: "#ffffff",
    accentColor: "#5227FF",
    changeMenuColorOnOpen: true,
    closeOnClickAway: true,
    logoUrl: "",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#111", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaggeredMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LeftPosition: Story = {
  args: {
    position: "left",
    accentColor: "#e94560",
    colors: ["#e94560", "#1a1a2e"],
  },
}
