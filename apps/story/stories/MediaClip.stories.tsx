import { MediaClip } from "@repo/ui/components/motion/media-clip"
import { Picture } from "@repo/ui/components/picture"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"

const still = (
  <Picture
    image={{
      name: "hero-poster",
      width: 1280,
      height: 720,
      small: { width: 1280, height: 720 },
      alt: "A bright lobby in wood and stone.",
    }}
    className="aspect-video w-full object-cover"
  />
)

const meta = {
  title: "Components/Coaching/MediaClip",
  component: MediaClip,
  tags: ["autodocs"],
  args: {
    src: "/media/hero.mp4",
    poster: "/media/hero-poster.jpg",
    width: 1280,
    height: 720,
    still,
    labels: { play: "Play the clip", pause: "Pause the clip" },
    icons: { play: <span aria-hidden="true">▶</span>, pause: <span aria-hidden="true">❚❚</span> },
    className: "max-w-xl overflow-hidden rounded-4xl bg-sun-soft",
  },
} satisfies Meta<typeof MediaClip>

export default meta
type Story = StoryObj<typeof meta>

/** The still, with the round toggle once mounted: pause where it plays, play under reduced motion. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const still = canvas.getByRole("img", { name: /bright lobby/ }) as HTMLImageElement
    await waitFor(() => expect(still.naturalWidth).toBe(1280))
    await expect(await canvas.findByRole("button", { name: /the clip/ })).toBeInTheDocument()
  },
}
