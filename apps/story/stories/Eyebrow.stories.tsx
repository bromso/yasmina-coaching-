import { Eyebrow } from "@repo/ui/components/eyebrow"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Coaching/Eyebrow",
  component: Eyebrow,
  tags: ["autodocs"],
  args: { children: "Ledarskap inifrån" },
} satisfies Meta<typeof Eyebrow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Ledarskap inifrån")).toBeInTheDocument()
  },
}

/** Above a section's headline, as www sets it. */
export const AboveAHeadline: Story = {
  render: (args) => (
    <div className="grid gap-3">
      <Eyebrow {...args} />
      <h2 className="text-4xl">Att leda börjar inifrån</h2>
    </div>
  ),
}

/** `as`: the label is the list's heading, as on www's credentials. */
export const AsAHeading: Story = {
  args: { as: "h3", children: "Utbildning" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("heading", { level: 3, name: "Utbildning" })
    ).toBeInTheDocument()
  },
}
