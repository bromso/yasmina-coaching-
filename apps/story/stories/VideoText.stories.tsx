import { VideoText } from "@repo/ui/components/video-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/VideoText",
  component: VideoText,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    src: {
      control: "text",
      description: "Video source URL",
    },
    fontSize: {
      control: { type: "number", min: 5, max: 40 },
      description: "Font size in viewport width units",
    },
    fontWeight: {
      control: "select",
      options: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
      description: "Font weight for the text mask",
    },
    autoPlay: {
      control: "boolean",
    },
    muted: {
      control: "boolean",
    },
    loop: {
      control: "boolean",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
  },
} satisfies Meta<typeof VideoText>

export default meta
type Story = StoryObj<typeof meta>

const SAMPLE_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"

export const Default: Story = {
  render: (args) => (
    <div className="flex h-screen items-center justify-center bg-black">
      <VideoText {...args}>HELLO</VideoText>
    </div>
  ),
  args: {
    src: SAMPLE_VIDEO,
    fontSize: 20,
    fontWeight: "bold",
  },
}

export const SmallText: Story = {
  render: (args) => (
    <div className="flex h-screen items-center justify-center bg-black">
      <VideoText {...args}>PLAY</VideoText>
    </div>
  ),
  args: {
    src: SAMPLE_VIDEO,
    fontSize: 10,
    fontWeight: "900",
  },
}

export const LargeText: Story = {
  render: (args) => (
    <div className="flex h-screen items-center justify-center bg-black">
      <VideoText {...args}>BIG</VideoText>
    </div>
  ),
  args: {
    src: SAMPLE_VIDEO,
    fontSize: 35,
    fontWeight: "bold",
  },
}
