import ProfileCard from "@repo/ui/components/ProfileCard"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/ProfileCard",
  component: ProfileCard,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Name displayed on the card",
    },
    title: {
      control: "text",
      description: "Job title or subtitle",
    },
    handle: {
      control: "text",
      description: "Social handle shown in the info bar",
    },
    status: {
      control: "text",
      description: "Status text (e.g. Online, Away)",
    },
    contactText: {
      control: "text",
      description: "Label on the contact button",
    },
    showUserInfo: {
      control: "boolean",
      description: "Show the bottom user info bar",
    },
    enableTilt: {
      control: "boolean",
      description: "Enable 3D tilt on hover",
    },
    behindGlowEnabled: {
      control: "boolean",
      description: "Enable background glow effect",
    },
    behindGlowColor: {
      control: "color",
      description: "Color of the background glow",
    },
  },
  args: {
    avatarUrl: "https://picsum.photos/seed/avatar/400/600",
    name: "Javi A. Torres",
    title: "Software Engineer",
    handle: "javicodes",
    status: "Online",
    contactText: "Contact",
    showUserInfo: true,
    enableTilt: true,
    behindGlowEnabled: true,
  },
  decorators: [
    (Story) => (
      <div style={{ padding: "3rem", background: "#0a0a0a" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoUserInfo: Story = {
  args: {
    showUserInfo: false,
    name: "Jane Doe",
    title: "Product Designer",
  },
}
