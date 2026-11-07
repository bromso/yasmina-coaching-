import { SmoothCursor } from "@repo/ui/components/smooth-cursor"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/SmoothCursor",
  component: SmoothCursor,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SmoothCursor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <SmoothCursor />
      <p className="text-lg text-muted-foreground">Move your mouse to see the smooth cursor</p>
    </div>
  ),
}

export const CustomCursor: Story = {
  render: () => (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <SmoothCursor
        cursor={
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <svg
              aria-hidden="true"
              focusable="false"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        }
      />
      <p className="text-lg text-muted-foreground">Custom cursor shape</p>
    </div>
  ),
}

export const CustomSpring: Story = {
  render: () => (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <SmoothCursor
        springConfig={{
          damping: 20,
          stiffness: 200,
          mass: 2,
          restDelta: 0.001,
        }}
      />
      <p className="text-lg text-muted-foreground">Slower, heavier spring configuration</p>
    </div>
  ),
}
