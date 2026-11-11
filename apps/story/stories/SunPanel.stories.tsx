import { ArrowLink } from "@repo/ui/components/arrow-link"
import { Eyebrow } from "@repo/ui/components/eyebrow"
import { SunPanel } from "@repo/ui/components/sun-panel"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Coaching/SunPanel",
  component: SunPanel,
  tags: ["autodocs"],
  argTypes: { tone: { control: "inline-radio", options: ["soft", "sun"] } },
} satisfies Meta<typeof SunPanel>

export default meta
type Story = StoryObj<typeof meta>

/** A teaser card on the soft ground. */
export const Soft: Story = {
  render: (args) => (
    <SunPanel {...args} className="grid max-w-xl gap-4 p-8">
      <Eyebrow>Coachning</Eyebrow>
      <h2 className="text-3xl">Ett samtal i taget</h2>
      <p>Sex samtal över tre månader, på plats eller på distans.</p>
      <ArrowLink href="#" label="Läs mer" />
    </SunPanel>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { level: 2 })).toBeInTheDocument()
  },
}

/** A call to action on the full sun. */
export const Sun: Story = {
  args: { tone: "sun" },
  render: (args) => (
    <SunPanel {...args} as="section" aria-label="Boka" className="grid max-w-xl gap-4 px-6 py-10">
      <h2 className="text-3xl">Boka ett introsamtal</h2>
      <p>Trettio minuter, utan kostnad.</p>
    </SunPanel>
  ),
}
