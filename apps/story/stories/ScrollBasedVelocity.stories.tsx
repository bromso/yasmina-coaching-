import {
  ScrollVelocityContainer,
  ScrollVelocityRow,
} from "@repo/ui/components/scroll-based-velocity"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/ScrollBasedVelocity",
  component: ScrollVelocityRow,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ScrollVelocityRow>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-4 overflow-hidden">
        <ScrollVelocityRow baseVelocity={5}>
          <span className="mx-4 text-4xl font-bold">Scroll to speed up</span>
        </ScrollVelocityRow>
      </div>
    </div>
  ),
}

export const OppositeDirections: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-2 overflow-hidden">
        <ScrollVelocityRow baseVelocity={5} direction={1}>
          <span className="mx-4 text-4xl font-bold">Moving right</span>
        </ScrollVelocityRow>
        <ScrollVelocityRow baseVelocity={5} direction={-1}>
          <span className="mx-4 text-4xl font-bold text-muted-foreground">Moving left</span>
        </ScrollVelocityRow>
      </div>
    </div>
  ),
}

export const WithContainer: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        <ScrollVelocityContainer className="flex flex-col gap-2">
          <ScrollVelocityRow baseVelocity={3} direction={1}>
            <span className="mx-4 text-3xl font-bold">Shared velocity context</span>
          </ScrollVelocityRow>
          <ScrollVelocityRow baseVelocity={5} direction={-1}>
            <span className="mx-4 text-3xl font-bold text-muted-foreground">
              Synced scroll response
            </span>
          </ScrollVelocityRow>
          <ScrollVelocityRow baseVelocity={2} direction={1}>
            <span className="mx-4 text-3xl font-bold text-primary">Different base speeds</span>
          </ScrollVelocityRow>
        </ScrollVelocityContainer>
      </div>
    </div>
  ),
}

export const SlowMarquee: Story = {
  render: () => (
    <div className="h-[300vh] bg-background">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        <ScrollVelocityRow baseVelocity={1}>
          <span className="mx-8 text-6xl font-extrabold tracking-tight">SLOW AND STEADY</span>
        </ScrollVelocityRow>
      </div>
    </div>
  ),
}
