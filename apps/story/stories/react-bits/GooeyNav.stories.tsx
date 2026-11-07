import GooeyNav from "@repo/ui/components/GooeyNav"
import type { Meta, StoryObj } from "@storybook/react-vite"

const navItems = [
  { label: "Home", href: "#" },
  { label: "About", href: "#" },
  { label: "Contact", href: "#" },
]

const meta = {
  title: "React Bits/Components/GooeyNav",
  component: GooeyNav,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  tags: ["autodocs"],
  argTypes: {
    animationTime: {
      control: { type: "range", min: 200, max: 1500, step: 50 },
      description: "Duration of the particle animation in ms",
    },
    particleCount: {
      control: { type: "range", min: 5, max: 40, step: 1 },
      description: "Number of particles emitted on click",
    },
    particleR: {
      control: { type: "range", min: 20, max: 200, step: 10 },
      description: "Particle rotation range",
    },
    timeVariance: {
      control: { type: "range", min: 0, max: 600, step: 50 },
      description: "Variance in particle timing",
    },
    initialActiveIndex: {
      control: { type: "number", min: 0 },
      description: "Initially active nav item index",
    },
  },
  args: {
    items: navItems,
    animationTime: 600,
    particleCount: 15,
    particleR: 100,
    timeVariance: 300,
    initialActiveIndex: 0,
  },
  decorators: [
    (Story) => (
      <div style={{ padding: "2rem", background: "#111" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GooeyNav>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FiveItems: Story = {
  args: {
    items: [
      { label: "Home", href: "#" },
      { label: "Products", href: "#" },
      { label: "Services", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
    ],
    initialActiveIndex: 2,
  },
}
