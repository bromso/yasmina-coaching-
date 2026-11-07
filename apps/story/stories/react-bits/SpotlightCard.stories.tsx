import SpotlightCard from "@repo/ui/components/SpotlightCard"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/SpotlightCard",
  component: SpotlightCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    spotlightColor: {
      control: "text",
      description: "RGBA color string for the spotlight gradient",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
  args: {
    spotlightColor:
      "rgba(255, 255, 255, 0.25)" as `rgba(${number}, ${number}, ${number}, ${number})`,
    children: (
      <div style={{ color: "white", minWidth: "280px" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Spotlight Card
        </h3>
        <p style={{ fontSize: "0.875rem", opacity: 0.7, lineHeight: 1.5 }}>
          Move your cursor over this card to reveal the spotlight effect that follows your mouse.
        </p>
      </div>
    ),
  },
} satisfies Meta<typeof SpotlightCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ColoredSpotlight: Story = {
  args: {
    spotlightColor: "rgba(0, 200, 255, 0.3)" as `rgba(${number}, ${number}, ${number}, ${number})`,
    children: (
      <div style={{ color: "white", minWidth: "280px" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Cyan Spotlight
        </h3>
        <p style={{ fontSize: "0.875rem", opacity: 0.7, lineHeight: 1.5 }}>
          A custom cyan-colored spotlight effect.
        </p>
      </div>
    ),
  },
}
