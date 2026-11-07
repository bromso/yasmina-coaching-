import { Pointer } from "@repo/ui/components/pointer"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/Pointer",
  component: Pointer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Pointer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="relative flex h-[300px] w-[500px] items-center justify-center rounded-xl border bg-muted/30">
      <Pointer />
      <p className="text-muted-foreground">Hover over this area</p>
    </div>
  ),
}

export const CustomChildren: Story = {
  render: () => (
    <div className="relative flex h-[300px] w-[500px] items-center justify-center rounded-xl border bg-muted/30">
      <Pointer>
        <span className="text-2xl">👆</span>
      </Pointer>
      <p className="text-muted-foreground">Custom cursor with emoji</p>
    </div>
  ),
}

export const WithContent: Story = {
  render: () => (
    <div className="relative flex h-[300px] w-[500px] flex-col items-center justify-center gap-4 rounded-xl border bg-gradient-to-br from-purple-500/10 to-pink-500/10">
      <Pointer>
        <div className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground shadow-lg">
          Follow me
        </div>
      </Pointer>
      <h3 className="text-xl font-semibold">Interactive Area</h3>
      <p className="text-sm text-muted-foreground">The cursor transforms on hover</p>
    </div>
  ),
}
