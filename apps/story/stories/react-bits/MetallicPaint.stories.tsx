import MetallicPaint from "@repo/ui/components/MetallicPaint"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/MetallicPaint",
  component: MetallicPaint,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    imageSrc: { control: "text" },
    seed: { control: { type: "number", min: 0, max: 100, step: 1 } },
    scale: { control: { type: "number", min: 1, max: 10, step: 0.5 } },
    refraction: { control: { type: "number", min: 0, max: 0.1, step: 0.005 } },
    blur: { control: { type: "number", min: 0, max: 0.1, step: 0.005 } },
    liquid: { control: { type: "number", min: 0, max: 2, step: 0.05 } },
    speed: { control: { type: "number", min: 0.05, max: 2, step: 0.05 } },
    brightness: { control: { type: "number", min: 0.5, max: 4, step: 0.1 } },
    contrast: { control: { type: "number", min: 0, max: 2, step: 0.1 } },
    angle: { control: { type: "number", min: -180, max: 180, step: 5 } },
    fresnel: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    lightColor: { control: "color" },
    darkColor: { control: "color" },
    tintColor: { control: "color" },
    patternSharpness: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    waveAmplitude: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    noiseScale: { control: { type: "number", min: 0, max: 2, step: 0.1 } },
    chromaticSpread: { control: { type: "number", min: 0, max: 5, step: 0.1 } },
    mouseAnimation: { control: "boolean" },
    distortion: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    contour: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
  },
  args: {
    imageSrc:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/512px-React-icon.svg.png",
    seed: 42,
    scale: 4,
    refraction: 0.01,
    blur: 0.015,
    liquid: 0.75,
    speed: 0.3,
    brightness: 2,
    contrast: 0.5,
    angle: 0,
    fresnel: 1,
    lightColor: "#ffffff",
    darkColor: "#000000",
    tintColor: "#feb3ff",
    patternSharpness: 1,
    waveAmplitude: 1,
    noiseScale: 0.5,
    chromaticSpread: 2,
    mouseAnimation: false,
    distortion: 1,
    contour: 0.2,
  },
} satisfies Meta<typeof MetallicPaint>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "500px", height: "500px" }}>
        <MetallicPaint {...args} />
      </div>
    </div>
  ),
}

export const MouseControlled: Story = {
  args: {
    mouseAnimation: true,
    tintColor: "#67cfff",
    brightness: 2.5,
    liquid: 1.2,
  },
  render: (args) => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "500px", height: "500px" }}>
        <MetallicPaint {...args} />
      </div>
    </div>
  ),
}
