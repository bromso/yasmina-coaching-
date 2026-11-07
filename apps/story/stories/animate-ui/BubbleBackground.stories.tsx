import { BubbleBackground } from "@repo/ui/components/animate-ui/components/backgrounds/bubble"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/BubbleBackground",
  component: BubbleBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    interactive: {
      control: "boolean",
      description: "Enable mouse-follow interaction for the sixth bubble",
    },
  },
} satisfies Meta<typeof BubbleBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="h-[500px] w-full">
      <BubbleBackground {...args}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Bubble Background</h1>
        </div>
      </BubbleBackground>
    </div>
  ),
}

export const Interactive: Story = {
  render: () => (
    <div className="h-[500px] w-full">
      <BubbleBackground interactive>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Move your mouse</h1>
        </div>
      </BubbleBackground>
    </div>
  ),
}

export const CustomColors: Story = {
  render: () => (
    <div className="h-[500px] w-full">
      <BubbleBackground
        colors={{
          first: "255,100,50",
          second: "50,200,100",
          third: "100,50,255",
          fourth: "255,200,0",
          fifth: "0,150,255",
          sixth: "255,50,150",
        }}
      >
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Custom Colors</h1>
        </div>
      </BubbleBackground>
    </div>
  ),
}

export const WithContent: Story = {
  render: () => (
    <div className="h-[500px] w-full">
      <BubbleBackground interactive>
        <div className="relative z-10 flex flex-col items-center justify-center size-full gap-4">
          <h1 className="text-5xl font-bold text-white">Welcome</h1>
          <p className="text-lg text-white/80 max-w-md text-center">
            A beautiful animated gradient background with interactive mouse tracking.
          </p>
        </div>
      </BubbleBackground>
    </div>
  ),
}
