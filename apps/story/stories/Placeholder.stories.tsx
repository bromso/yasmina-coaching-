import { Placeholder } from "@repo/ui/components/placeholder"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Placeholder",
  component: Placeholder,
  tags: ["autodocs"],
  args: { children: "[ATT FYLLA: organisationsnummer]" },
  render: (args) => (
    <p className="max-w-prose text-lg leading-relaxed">
      Webbplatsen drivs av Yasmina Petersson, organisationsnummer <Placeholder {...args} />, med
      säte i Sverige.
    </p>
  ),
} satisfies Meta<typeof Placeholder>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mark = canvasElement.querySelector("mark[data-placeholder]")
    await expect(mark).toHaveTextContent("[ATT FYLLA: organisationsnummer]")
    await expect(within(canvasElement).getByText(/Webbplatsen drivs/)).toBeInTheDocument()
  },
}

export const English: Story = {
  args: { children: "[TO FILL: company registration number]" },
  render: (args) => (
    <p className="max-w-prose text-lg leading-relaxed">
      The site is run by Yasmina Petersson, company registration number <Placeholder {...args} />.
    </p>
  ),
}
