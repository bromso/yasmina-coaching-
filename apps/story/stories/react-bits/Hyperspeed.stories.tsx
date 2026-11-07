import { hyperspeedPresets } from "@repo/ui/components/HyperSpeedPresets"
import Hyperspeed from "@repo/ui/components/Hyperspeed"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"

type EffectOptions = NonNullable<ComponentProps<typeof Hyperspeed>["effectOptions"]>
type Preset = (typeof hyperspeedPresets)[keyof typeof hyperspeedPresets]

// The presets are a plain object literal, so their [min, max] ranges are typed `number[]` while
// Hyperspeed takes `[number, number]` tuples. Re-pair them (the values are unchanged) rather
// than casting.
function pair(values: number[]): [number, number] {
  const [min, max] = values
  if (min === undefined || max === undefined) {
    throw new Error("A Hyperspeed preset range must be a [min, max] pair")
  }
  return [min, max]
}

function presetOptions(preset: Preset): EffectOptions {
  return {
    ...preset,
    lightStickWidth: pair(preset.lightStickWidth),
    lightStickHeight: pair(preset.lightStickHeight),
    movingAwaySpeed: pair(preset.movingAwaySpeed),
    movingCloserSpeed: pair(preset.movingCloserSpeed),
    carLightsLength: pair(preset.carLightsLength),
    carLightsRadius: pair(preset.carLightsRadius),
    carWidthPercentage: pair(preset.carWidthPercentage),
    carShiftX: pair(preset.carShiftX),
    carFloorSeparation: pair(preset.carFloorSeparation),
  }
}

const meta = {
  title: "React Bits/Backgrounds/Hyperspeed",
  component: Hyperspeed,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    effectOptions: {
      control: { type: "object" },
      description: "Effect configuration options including distortion, colors, speeds, and more",
    },
  },
  args: {
    effectOptions: presetOptions(hyperspeedPresets.one),
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Hyperspeed>

export default meta
type Story = StoryObj<typeof meta>

export const PresetOne: Story = {
  args: {
    effectOptions: presetOptions(hyperspeedPresets.one),
  },
}

export const PresetTwo: Story = {
  args: {
    effectOptions: presetOptions(hyperspeedPresets.two),
  },
}

export const PresetThree: Story = {
  args: {
    effectOptions: presetOptions(hyperspeedPresets.three),
  },
}

export const PresetFour: Story = {
  args: {
    effectOptions: presetOptions(hyperspeedPresets.four),
  },
}

export const PresetFive: Story = {
  args: {
    effectOptions: presetOptions(hyperspeedPresets.five),
  },
}

export const PresetSix: Story = {
  args: {
    effectOptions: presetOptions(hyperspeedPresets.six),
  },
}
