import { ScrollProgress } from "@repo/ui/components/scroll-progress"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/ScrollProgress",
  component: ScrollProgress,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ScrollProgress>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <ScrollProgress />
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">
          Scroll down to see the progress bar at the top
        </p>
      </div>
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Keep scrolling...</p>
      </div>
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Almost there!</p>
      </div>
    </div>
  ),
}

export const CustomHeight: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <ScrollProgress className="h-1" />
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Thicker progress bar (4px)</p>
      </div>
    </div>
  ),
}

export const CustomColor: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <ScrollProgress className="h-0.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500" />
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Custom gradient colors</p>
      </div>
    </div>
  ),
}
