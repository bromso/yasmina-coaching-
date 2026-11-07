import { AnimatedBeam } from "@repo/ui/components/animated-beam"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useRef } from "react"

const meta = {
  title: "Components/Text & Animation/AnimatedBeam",
  component: AnimatedBeam,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AnimatedBeam>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

function BeamDemo({
  curvature = 0,
  reverse = false,
  pathColor = "gray",
  pathWidth = 2,
  gradientStartColor = "#ffaa40",
  gradientStopColor = "#9c40ff",
  duration = 5,
}: {
  curvature?: number
  reverse?: boolean
  pathColor?: string
  pathWidth?: number
  gradientStartColor?: string
  gradientStopColor?: string
  duration?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fromRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-[300px] w-[500px] items-center justify-between rounded-lg border p-10"
    >
      <div
        ref={fromRef}
        className="z-10 flex size-12 items-center justify-center rounded-full border bg-white shadow-md"
      >
        A
      </div>
      <div
        ref={toRef}
        className="z-10 flex size-12 items-center justify-center rounded-full border bg-white shadow-md"
      >
        B
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        curvature={curvature}
        reverse={reverse}
        pathColor={pathColor}
        pathWidth={pathWidth}
        gradientStartColor={gradientStartColor}
        gradientStopColor={gradientStopColor}
        duration={duration}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <BeamDemo />,
}

export const CurvedBeam: Story = {
  render: () => <BeamDemo curvature={75} />,
}

export const ReversedDirection: Story = {
  render: () => <BeamDemo reverse />,
}

export const CustomColors: Story = {
  render: () => (
    <BeamDemo gradientStartColor="#00ff88" gradientStopColor="#0088ff" pathColor="#e0e0e0" />
  ),
}

export const ThickPath: Story = {
  render: () => <BeamDemo pathWidth={5} />,
}

function MultipleBeamsDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-[300px] w-[500px] items-center justify-between rounded-lg border p-10"
    >
      <div
        ref={leftRef}
        className="z-10 flex size-12 items-center justify-center rounded-full border bg-white shadow-md"
      >
        1
      </div>
      <div
        ref={centerRef}
        className="z-10 flex size-12 items-center justify-center rounded-full border bg-white shadow-md"
      >
        2
      </div>
      <div
        ref={rightRef}
        className="z-10 flex size-12 items-center justify-center rounded-full border bg-white shadow-md"
      >
        3
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={leftRef}
        toRef={centerRef}
        curvature={-40}
        gradientStartColor="#ffaa40"
        gradientStopColor="#9c40ff"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={centerRef}
        toRef={rightRef}
        curvature={40}
        gradientStartColor="#00ff88"
        gradientStopColor="#0088ff"
      />
    </div>
  )
}

export const MultipleBeams: Story = {
  render: () => <MultipleBeamsDemo />,
}
