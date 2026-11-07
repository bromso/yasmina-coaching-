import LetterGlitch from "@repo/ui/components/LetterGlitch"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/LetterGlitch",
  component: LetterGlitch,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    glitchColors: {
      control: { type: "object" },
      description: "Array of hex colors for the glitch characters",
    },
    glitchSpeed: {
      control: { type: "range", min: 10, max: 200, step: 10 },
      description: "Speed of character updates in milliseconds",
    },
    centerVignette: { control: "boolean", description: "Show dark center vignette" },
    outerVignette: { control: "boolean", description: "Show dark outer vignette" },
    smooth: { control: "boolean", description: "Enable smooth color transitions" },
    characters: {
      control: { type: "text" },
      description: "Character set used for the glitch text",
    },
  },
  args: {
    glitchColors: ["#2b4539", "#61dca3", "#61b3dc"],
    glitchSpeed: 50,
    centerVignette: false,
    outerVignette: true,
    smooth: true,
    characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LetterGlitch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const MatrixStyle: Story = {
  args: {
    glitchColors: ["#003300", "#00ff41", "#008f11"],
    glitchSpeed: 30,
    outerVignette: true,
    centerVignette: true,
    characters: "01",
  },
}
