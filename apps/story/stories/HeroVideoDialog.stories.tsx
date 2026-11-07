import { HeroVideoDialog } from "@repo/ui/components/hero-video-dialog"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Surfaces/HeroVideoDialog",
  component: HeroVideoDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    animationStyle: {
      control: "select",
      options: [
        "from-bottom",
        "from-center",
        "from-top",
        "from-left",
        "from-right",
        "fade",
        "top-in-bottom-out",
        "left-in-right-out",
      ],
      description: "Animation style for the video dialog entrance and exit",
    },
    videoSrc: {
      control: "text",
      description: "URL of the video to play (supports iframe embed URLs)",
    },
    thumbnailSrc: {
      control: "text",
      description: "URL of the thumbnail image",
    },
    thumbnailAlt: {
      control: "text",
      description: "Alt text for the thumbnail image",
    },
  },
} satisfies Meta<typeof HeroVideoDialog>

export default meta
type Story = StoryObj<typeof meta>

const defaultArgs = {
  videoSrc: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  thumbnailSrc: "https://placehold.co/1920x1080/1a1a2e/ffffff?text=Click+to+Play",
  thumbnailAlt: "Video thumbnail",
}

export const Default: Story = {
  args: {
    ...defaultArgs,
    animationStyle: "from-center",
  },
  render: (args) => (
    <div className="w-[640px]">
      <HeroVideoDialog {...args} />
    </div>
  ),
}

export const FromBottom: Story = {
  args: {
    ...defaultArgs,
    animationStyle: "from-bottom",
  },
  render: (args) => (
    <div className="w-[640px]">
      <HeroVideoDialog {...args} />
    </div>
  ),
}

export const FromTop: Story = {
  args: {
    ...defaultArgs,
    animationStyle: "from-top",
  },
  render: (args) => (
    <div className="w-[640px]">
      <HeroVideoDialog {...args} />
    </div>
  ),
}

export const Fade: Story = {
  args: {
    ...defaultArgs,
    animationStyle: "fade",
  },
  render: (args) => (
    <div className="w-[640px]">
      <HeroVideoDialog {...args} />
    </div>
  ),
}

export const FromLeft: Story = {
  args: {
    ...defaultArgs,
    animationStyle: "from-left",
  },
  render: (args) => (
    <div className="w-[640px]">
      <HeroVideoDialog {...args} />
    </div>
  ),
}
