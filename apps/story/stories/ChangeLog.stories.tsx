import { ChangeLog } from "@repo/ui/components/change-log"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/ChangeLog",
  component: ChangeLog,
  tags: ["autodocs"],
  args: {
    changes: [
      { date: new Date("2026-12-01"), summary: "Ny regel för avbokning av gruppträffar." },
      { date: new Date("2026-11-12"), summary: "Första utkastet." },
    ],
    dateLocale: "sv-SE",
    labels: { heading: "Ändringar" },
  },
} satisfies Meta<typeof ChangeLog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const log = canvas.getByRole("region", { name: "Ändringar" })
    const items = within(log).getAllByRole("listitem")
    await expect(items).toHaveLength(2)
    await expect(items[0]?.querySelector("time")).toHaveAttribute("datetime", "2026-12-01")
  },
}

export const English: Story = {
  args: {
    changes: [{ date: new Date("2026-11-12"), summary: "First draft." }],
    dateLocale: "en-GB",
    labels: { heading: "Changes" },
  },
}
