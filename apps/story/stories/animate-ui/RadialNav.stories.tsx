import {
  RadialNav,
  type RadialNavItem,
} from "@repo/ui/components/animate-ui/components/community/radial-nav"
import type { Meta, StoryObj } from "@storybook/react-vite"

const defaultItems: RadialNavItem[] = [
  { id: 1, icon: "lucide:home", label: "Home", angle: 0 },
  { id: 2, icon: "lucide:search", label: "Search", angle: 72 },
  { id: 3, icon: "lucide:bell", label: "Notifications", angle: 144 },
  { id: 4, icon: "lucide:user", label: "Profile", angle: 216 },
  { id: 5, icon: "lucide:settings", label: "Settings", angle: 288 },
]

const meta = {
  title: "Animate UI/Community/RadialNav",
  component: RadialNav,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "number", min: 120, max: 300, step: 10 },
    },
    defaultActiveId: {
      control: { type: "number", min: 1, max: 6 },
    },
  },
  args: {
    items: defaultItems,
    size: 180,
  },
} satisfies Meta<typeof RadialNav>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithDefaultActive: Story = {
  args: {
    defaultActiveId: 1,
  },
}

export const ThreeItems: Story = {
  args: {
    items: [
      { id: 1, icon: "lucide:home", label: "Home", angle: 0 },
      { id: 2, icon: "lucide:user", label: "Profile", angle: 120 },
      { id: 3, icon: "lucide:settings", label: "Settings", angle: 240 },
    ],
    defaultActiveId: 1,
  },
}

export const FourItems: Story = {
  args: {
    items: [
      { id: 1, icon: "lucide:home", label: "Home", angle: 0 },
      { id: 2, icon: "lucide:search", label: "Search", angle: 90 },
      { id: 3, icon: "lucide:heart", label: "Favorites", angle: 180 },
      { id: 4, icon: "lucide:settings", label: "Settings", angle: 270 },
    ],
    defaultActiveId: 1,
  },
}

export const LargeSize: Story = {
  args: {
    size: 260,
    defaultActiveId: 3,
  },
}

export const SmallSize: Story = {
  args: {
    size: 140,
    items: [
      { id: 1, icon: "lucide:home", label: "Home", angle: 0 },
      { id: 2, icon: "lucide:user", label: "Profile", angle: 120 },
      { id: 3, icon: "lucide:settings", label: "Settings", angle: 240 },
    ],
    defaultActiveId: 1,
  },
}

export const CustomMenuButton: Story = {
  args: {
    defaultActiveId: 2,
    menuButtonConfig: {
      iconSize: 24,
      buttonSize: 48,
      buttonPadding: 10,
    },
  },
}
