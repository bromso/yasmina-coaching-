import { Card, CardContent } from "@repo/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@repo/ui/components/carousel"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Surfaces/Carousel",
  component: Carousel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
      description: "The orientation of the carousel",
    },
  },
} satisfies Meta<typeof Carousel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {[1, 2, 3, 4, 5].map((num) => (
          <CarouselItem key={`slide-${num}`}>
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  <span className="text-4xl font-semibold">{num}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const prevButton = canvas.getByRole("button", { name: /previous slide/i })
    const nextButton = canvas.getByRole("button", { name: /next slide/i })

    await expect(prevButton).toBeInTheDocument()
    await expect(nextButton).toBeInTheDocument()
    await expect(canvas.getByText("1")).toBeVisible()

    await userEvent.click(nextButton)
  },
}

export const WithMultipleItems: Story = {
  render: () => (
    <Carousel
      opts={{
        align: "start",
      }}
      className="w-full max-w-sm"
    >
      <CarouselContent>
        {[1, 2, 3, 4, 5].map((num) => (
          <CarouselItem key={`multi-${num}`} className="basis-1/3">
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  <span className="text-3xl font-semibold">{num}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const Vertical: Story = {
  render: () => (
    <Carousel
      opts={{
        align: "start",
      }}
      orientation="vertical"
      className="w-full max-w-xs"
    >
      <CarouselContent className="-mt-1 h-[200px]">
        {[1, 2, 3, 4, 5].map((num) => (
          <CarouselItem key={`vertical-${num}`} className="basis-1/2 pt-1">
            <div className="p-1">
              <Card>
                <CardContent className="flex items-center justify-center p-6">
                  <span className="text-3xl font-semibold">{num}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const WithImages: Story = {
  render: () => (
    <Carousel className="w-full max-w-lg">
      <CarouselContent>
        {[1, 2, 3, 4, 5].map((num) => (
          <CarouselItem key={num}>
            <div className="p-1">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-muted flex aspect-video items-center justify-center">
                    <span className="text-muted-foreground">Image {num}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}
