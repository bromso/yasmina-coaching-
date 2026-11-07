import { StatCardChoropleth } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

// Fetches the world topology from GitHub at runtime; needs network access.
const meta = {
  title: "Bklit/Blocks/StatCardChoropleth",
  component: StatCardChoropleth,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StatCardChoropleth>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="w-[720px] max-w-3xl">
      <StatCardChoropleth />
    </div>
  ),
}
