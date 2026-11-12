import { Picture } from "@repo/ui/components/picture"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"

/** www's own `public/media/`, served by Storybook at `/media`. */
const meta = {
  title: "Components/Coaching/Picture",
  component: Picture,
  tags: ["autodocs"],
  args: {
    image: {
      name: "keynote-audience",
      width: 1600,
      height: 1195,
      small: { width: 800, height: 597 },
      alt: "Yasmina Petersson speaks with a headset in front of a large audience.",
    },
    small: true,
    className: "w-full max-w-md rounded-4xl object-cover",
  },
} satisfies Meta<typeof Picture>

export default meta
type Story = StoryObj<typeof meta>

export const Small: Story = {
  play: async ({ canvasElement }) => {
    const img = within(canvasElement).getByRole("img", { name: /large audience/ })
    await expect(img).toHaveAttribute("src", "/media/keynote-audience-800.jpg")
    await expect(canvasElement.querySelector("source")).toHaveAttribute(
      "srcset",
      "/media/keynote-audience-800.webp"
    )
    // The file really loads (Storybook serves www's media at /media).
    await waitFor(() => expect((img as HTMLImageElement).naturalWidth).toBe(800))
  },
}
