import { Icon } from "@repo/ui/components/icon"
import Carousel from "@repo/ui/components/ReactBitsCarousel"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/Carousel",
  component: Carousel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    baseWidth: {
      control: { type: "number", min: 200, max: 600 },
      description: "Base width of the carousel container",
    },
    autoplay: {
      control: { type: "boolean" },
      description: "Enable automatic slide progression",
    },
    autoplayDelay: {
      control: { type: "number", min: 1000, max: 10000, step: 500 },
      description: "Delay between autoplay transitions in ms",
    },
    pauseOnHover: {
      control: { type: "boolean" },
      description: "Pause autoplay when hovering",
    },
    loop: {
      control: { type: "boolean" },
      description: "Enable infinite looping",
    },
    round: {
      control: { type: "boolean" },
      description: "Use circular card shape",
    },
  },
  args: {
    baseWidth: 300,
    autoplay: false,
    autoplayDelay: 3000,
    pauseOnHover: false,
    loop: false,
    round: false,
  },
} satisfies Meta<typeof Carousel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const AutoplayLoop: Story = {
  args: {
    autoplay: true,
    autoplayDelay: 2000,
    pauseOnHover: true,
    loop: true,
    items: [
      {
        title: "Text Animations",
        description: "Cool text animations for your projects.",
        id: 1,
        icon: <Icon icon="lucide:file-text" className="h-[16px] w-[16px] text-white" />,
      },
      {
        title: "Animations",
        description: "Smooth animations for your projects.",
        id: 2,
        icon: <Icon icon="lucide:circle" className="h-[16px] w-[16px] text-white" />,
      },
      {
        title: "Components",
        description: "Reusable components for your projects.",
        id: 3,
        icon: <Icon icon="lucide:layers" className="h-[16px] w-[16px] text-white" />,
      },
      {
        title: "Backgrounds",
        description: "Beautiful backgrounds and patterns.",
        id: 4,
        icon: <Icon icon="lucide:layout" className="h-[16px] w-[16px] text-white" />,
      },
      {
        title: "Common UI",
        description: "Common UI components coming soon!",
        id: 5,
        icon: <Icon icon="lucide:code" className="h-[16px] w-[16px] text-white" />,
      },
    ],
  },
}
