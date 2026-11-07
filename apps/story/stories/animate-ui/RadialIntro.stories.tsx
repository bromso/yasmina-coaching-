import { RadialIntro } from "@repo/ui/components/animate-ui/components/community/radial-intro"
import type { Meta, StoryObj } from "@storybook/react-vite"

const defaultOrbitItems = [
  { id: 1, name: "React", src: "https://i.pravatar.cc/80?u=react" },
  { id: 2, name: "TypeScript", src: "https://i.pravatar.cc/80?u=typescript" },
  { id: 3, name: "Next.js", src: "https://i.pravatar.cc/80?u=nextjs" },
  { id: 4, name: "Tailwind", src: "https://i.pravatar.cc/80?u=tailwind" },
  { id: 5, name: "Storybook", src: "https://i.pravatar.cc/80?u=storybook" },
  { id: 6, name: "Vite", src: "https://i.pravatar.cc/80?u=vite" },
]

const meta = {
  title: "Animate UI/Community/RadialIntro",
  component: RadialIntro,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    stageSize: {
      control: { type: "number", min: 200, max: 600, step: 20 },
    },
    imageSize: {
      control: { type: "number", min: 30, max: 100, step: 5 },
    },
  },
  args: {
    orbitItems: defaultOrbitItems,
    stageSize: 320,
    imageSize: 60,
  },
} satisfies Meta<typeof RadialIntro>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SmallStage: Story = {
  args: {
    stageSize: 220,
    imageSize: 40,
  },
}

export const LargeStage: Story = {
  args: {
    stageSize: 480,
    imageSize: 80,
  },
}

export const ThreeItems: Story = {
  args: {
    orbitItems: defaultOrbitItems.slice(0, 3),
  },
}

export const EightItems: Story = {
  args: {
    orbitItems: [
      ...defaultOrbitItems,
      { id: 7, name: "Prisma", src: "https://i.pravatar.cc/80?u=prisma" },
      { id: 8, name: "Drizzle", src: "https://i.pravatar.cc/80?u=drizzle" },
    ],
  },
}
