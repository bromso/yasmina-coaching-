import type { ConfettiRef } from "@repo/ui/components/confetti"
import { Confetti, ConfettiButton } from "@repo/ui/components/confetti"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useRef } from "react"

const meta = {
  title: "Components/Effects/Confetti",
  component: Confetti,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Confetti>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="relative h-[300px] w-[500px]">
      <Confetti
        className="absolute inset-0 size-full"
        options={{
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        }}
      />
    </div>
  ),
}

export const ManualStart: Story = {
  render: function ManualStartStory() {
    const confettiRef = useRef<ConfettiRef>(null)
    return (
      <div className="relative flex h-[300px] w-[500px] items-center justify-center">
        <Confetti
          ref={confettiRef}
          className="absolute inset-0 size-full"
          manualstart
          options={{
            particleCount: 100,
            spread: 80,
          }}
        />
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => confettiRef.current?.fire()}
        >
          Launch Confetti
        </button>
      </div>
    )
  },
}

export const WithButton: Story = {
  render: () => (
    <ConfettiButton
      options={{
        particleCount: 60,
        spread: 55,
      }}
    >
      Click me for confetti
    </ConfettiButton>
  ),
}

export const Fireworks: Story = {
  render: function FireworksStory() {
    const confettiRef = useRef<ConfettiRef>(null)
    return (
      <div className="relative flex h-[300px] w-[500px] items-center justify-center">
        <Confetti ref={confettiRef} className="absolute inset-0 size-full" manualstart />
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => {
            confettiRef.current?.fire({
              particleCount: 30,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
            })
            confettiRef.current?.fire({
              particleCount: 30,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
            })
          }}
        >
          Fire from both sides
        </button>
      </div>
    )
  },
}
