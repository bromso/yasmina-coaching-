import tokens from "@repo/tokens/json"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Theme/Tokens",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface ColorSwatchProps {
  name: string
  value: string
  description?: string
}

function ColorSwatch({ name, value, description }: ColorSwatchProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-16 w-full rounded-lg border shadow-sm" style={{ backgroundColor: value }} />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{value}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

interface ColorGroupProps {
  title: string
  colors: { name: string; value: string; description?: string }[]
}

function ColorGroup({ title, colors }: ColorGroupProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold border-b pb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {colors.map((color) => (
          <ColorSwatch key={color.name} {...color} />
        ))}
      </div>
    </div>
  )
}

interface ShadowSwatchProps {
  name: string
  value: string
  description?: string
}

function ShadowSwatch({ name, value, description }: ShadowSwatchProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-24 w-full rounded-lg bg-white" style={{ boxShadow: value }} />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">{value}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

interface SpacingSwatchProps {
  name: string
  value: string
  description?: string
}

function SpacingSwatch({ name, value, description }: SpacingSwatchProps) {
  return (
    <div className="flex items-center gap-4 py-2 border-b last:border-b-0">
      <div className="w-24 shrink-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{value}</p>
      </div>
      <div className="flex-1">
        <div className="h-4 rounded bg-primary" style={{ width: value }} />
      </div>
      {description && <p className="text-xs text-muted-foreground w-32">{description}</p>}
    </div>
  )
}

interface TypographySwatchProps {
  name: string
  value: string
  description?: string
}

function TypographySwatch({ name, value, description }: TypographySwatchProps) {
  return (
    <div className="space-y-2 p-4 border rounded-lg">
      <div className="space-y-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{value}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <p className="text-2xl" style={{ fontFamily: value }}>
        The quick brown fox jumps over the lazy dog
      </p>
    </div>
  )
}

export const AllColors: Story = {
  name: "Colors",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText("Color Tokens")).toBeInTheDocument()
    // Use getAllByText since "Base" and "Primary" appear as both section titles and color names
    await expect(canvas.getAllByText("Base").length).toBeGreaterThan(0)
    await expect(canvas.getAllByText("Primary").length).toBeGreaterThan(0)
  },
  render: () => {
    const colorGroups: ColorGroupProps[] = [
      {
        title: "Base",
        colors: [
          {
            name: "Background",
            value: tokens.color.base.background,
            description: "Default background",
          },
          { name: "Foreground", value: tokens.color.base.foreground, description: "Default text" },
        ],
      },
      {
        title: "Primary",
        colors: [
          {
            name: "Primary",
            value: tokens.color.primary.default,
            description: "Primary brand color",
          },
          {
            name: "Primary Foreground",
            value: tokens.color.primary.foreground,
            description: "Text on primary",
          },
        ],
      },
      {
        title: "Secondary",
        colors: [
          {
            name: "Secondary",
            value: tokens.color.secondary.default,
            description: "Secondary color",
          },
          {
            name: "Secondary Foreground",
            value: tokens.color.secondary.foreground,
            description: "Text on secondary",
          },
        ],
      },
      {
        title: "Muted",
        colors: [
          { name: "Muted", value: tokens.color.muted.default, description: "Muted background" },
          {
            name: "Muted Foreground",
            value: tokens.color.muted.foreground,
            description: "Text on muted",
          },
        ],
      },
      {
        title: "Accent",
        colors: [
          { name: "Accent", value: tokens.color.accent.default, description: "Accent color" },
          {
            name: "Accent Foreground",
            value: tokens.color.accent.foreground,
            description: "Text on accent",
          },
        ],
      },
      {
        title: "Destructive",
        colors: [
          {
            name: "Destructive",
            value: tokens.color.destructive.default,
            description: "Error/destructive",
          },
          {
            name: "Destructive Foreground",
            value: tokens.color.destructive.foreground,
            description: "Text on destructive",
          },
        ],
      },
      {
        title: "Card & Popover",
        colors: [
          { name: "Card", value: tokens.color.card.default, description: "Card background" },
          {
            name: "Card Foreground",
            value: tokens.color.card.foreground,
            description: "Card text",
          },
          {
            name: "Popover",
            value: tokens.color.popover.default,
            description: "Popover background",
          },
          {
            name: "Popover Foreground",
            value: tokens.color.popover.foreground,
            description: "Popover text",
          },
        ],
      },
      {
        title: "Borders & Inputs",
        colors: [
          { name: "Border", value: tokens.color.border, description: "Border color" },
          { name: "Input", value: tokens.color.input, description: "Input border" },
          { name: "Ring", value: tokens.color.ring, description: "Focus ring" },
        ],
      },
      {
        title: "Chart Colors",
        colors: [
          { name: "Chart 1", value: tokens.color.chart["1"] },
          { name: "Chart 2", value: tokens.color.chart["2"] },
          { name: "Chart 3", value: tokens.color.chart["3"] },
          { name: "Chart 4", value: tokens.color.chart["4"] },
          { name: "Chart 5", value: tokens.color.chart["5"] },
        ],
      },
      {
        title: "Sidebar",
        colors: [
          { name: "Sidebar", value: tokens.color.sidebar.default },
          { name: "Sidebar Foreground", value: tokens.color.sidebar.foreground },
          { name: "Sidebar Primary", value: tokens.color.sidebar.primary },
          { name: "Sidebar Primary Foreground", value: tokens.color.sidebar["primary-foreground"] },
          { name: "Sidebar Accent", value: tokens.color.sidebar.accent },
          { name: "Sidebar Accent Foreground", value: tokens.color.sidebar["accent-foreground"] },
          { name: "Sidebar Border", value: tokens.color.sidebar.border },
          { name: "Sidebar Ring", value: tokens.color.sidebar.ring },
        ],
      },
    ]

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Color Tokens</h1>
          <p className="text-muted-foreground">
            Design system color palette using OKLCH color space for better perceptual uniformity.
          </p>
        </div>
        {colorGroups.map((group) => (
          <ColorGroup key={group.title} {...group} />
        ))}
      </div>
    )
  },
}

export const AllShadows: Story = {
  name: "Shadows",
  render: () => {
    const shadows: ShadowSwatchProps[] = [
      { name: "2xs", value: tokens.shadow["2xs"], description: "Extra extra small" },
      { name: "xs", value: tokens.shadow.xs, description: "Extra small" },
      { name: "sm", value: tokens.shadow.sm, description: "Small" },
      { name: "default", value: tokens.shadow.default, description: "Default" },
      { name: "md", value: tokens.shadow.md, description: "Medium" },
      { name: "lg", value: tokens.shadow.lg, description: "Large" },
      { name: "xl", value: tokens.shadow.xl, description: "Extra large" },
      { name: "2xl", value: tokens.shadow["2xl"], description: "Extra extra large" },
    ]

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Shadow Tokens</h1>
          <p className="text-muted-foreground">
            Elevation system using layered shadows for depth and hierarchy.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          {shadows.map((shadow) => (
            <ShadowSwatch key={shadow.name} {...shadow} />
          ))}
        </div>
      </div>
    )
  },
}

export const AllSpacing: Story = {
  name: "Spacing & Radius",
  render: () => {
    const spacingScale = [
      { name: "0", value: "0px", description: "None" },
      { name: "px", value: "1px", description: "Pixel" },
      { name: "0.5", value: "0.125rem", description: "2px" },
      { name: "1", value: "0.25rem", description: "4px (base)" },
      { name: "1.5", value: "0.375rem", description: "6px" },
      { name: "2", value: "0.5rem", description: "8px" },
      { name: "2.5", value: "0.625rem", description: "10px" },
      { name: "3", value: "0.75rem", description: "12px" },
      { name: "3.5", value: "0.875rem", description: "14px" },
      { name: "4", value: "1rem", description: "16px" },
      { name: "5", value: "1.25rem", description: "20px" },
      { name: "6", value: "1.5rem", description: "24px" },
      { name: "7", value: "1.75rem", description: "28px" },
      { name: "8", value: "2rem", description: "32px" },
      { name: "9", value: "2.25rem", description: "36px" },
      { name: "10", value: "2.5rem", description: "40px" },
      { name: "12", value: "3rem", description: "48px" },
      { name: "14", value: "3.5rem", description: "56px" },
      { name: "16", value: "4rem", description: "64px" },
    ]

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Spacing Tokens</h1>
          <p className="text-muted-foreground">
            Consistent spacing scale based on a {tokens.spacing.base} ({4 * 4}px) base unit.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Spacing Scale</h3>
          <div className="space-y-1">
            {spacingScale.map((spacing) => (
              <SpacingSwatch key={spacing.name} {...spacing} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Border Radius</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {[
              { name: "none", value: "0px" },
              { name: "sm", value: "calc(0.5rem - 4px)" },
              { name: "default", value: tokens.radius.default },
              { name: "md", value: "calc(0.5rem - 2px)" },
              { name: "lg", value: tokens.radius.default },
              { name: "xl", value: "0.75rem" },
              { name: "2xl", value: "1rem" },
              { name: "full", value: "9999px" },
            ].map((radius) => (
              <div key={radius.name} className="space-y-2">
                <div className="h-16 w-full bg-primary" style={{ borderRadius: radius.value }} />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{radius.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{radius.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}

export const AllTypography: Story = {
  name: "Typography",
  render: () => {
    const fonts: TypographySwatchProps[] = [
      {
        name: "Sans",
        value: tokens.font.family.sans,
        description: "Default sans-serif for body text",
      },
      {
        name: "Serif",
        value: tokens.font.family.serif,
        description: "Serif for headings and editorial",
      },
      {
        name: "Mono",
        value: tokens.font.family.mono,
        description: "Monospace for code and technical content",
      },
    ]

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Typography Tokens</h1>
          <p className="text-muted-foreground">
            Font families and text styling for consistent typography across the design system.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Font Families</h3>
          <div className="space-y-4">
            {fonts.map((font) => (
              <TypographySwatch key={font.name} {...font} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Letter Spacing</h3>
          <div className="p-4 border rounded-lg">
            <div className="space-y-1">
              <p className="text-sm font-medium">Normal</p>
              <p className="font-mono text-xs text-muted-foreground">{tokens.tracking.normal}</p>
              <p className="text-xs text-muted-foreground">Default letter spacing</p>
            </div>
            <p className="mt-4 text-xl" style={{ letterSpacing: tokens.tracking.normal }}>
              The quick brown fox jumps over the lazy dog
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Type Scale</h3>
          <div className="space-y-4">
            {[
              { name: "xs", size: "0.75rem", lineHeight: "1rem" },
              { name: "sm", size: "0.875rem", lineHeight: "1.25rem" },
              { name: "base", size: "1rem", lineHeight: "1.5rem" },
              { name: "lg", size: "1.125rem", lineHeight: "1.75rem" },
              { name: "xl", size: "1.25rem", lineHeight: "1.75rem" },
              { name: "2xl", size: "1.5rem", lineHeight: "2rem" },
              { name: "3xl", size: "1.875rem", lineHeight: "2.25rem" },
              { name: "4xl", size: "2.25rem", lineHeight: "2.5rem" },
              { name: "5xl", size: "3rem", lineHeight: "1" },
            ].map((type) => (
              <div
                key={type.name}
                className="flex items-baseline gap-4 py-2 border-b last:border-b-0"
              >
                <div className="w-16 shrink-0">
                  <p className="text-sm font-medium">{type.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{type.size}</p>
                </div>
                <p
                  style={{
                    fontSize: type.size,
                    lineHeight: type.lineHeight,
                    fontFamily: tokens.font.family.sans,
                  }}
                >
                  The quick brown fox
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}

export const Overview: Story = {
  name: "Overview",
  render: () => (
    <div className="space-y-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">Design Tokens</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Design tokens are the visual design atoms of the design system. They are named entities
          that store visual design attributes like colors, typography, and spacing.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-6 border rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-primary" />
            <div className="h-10 w-10 rounded-lg bg-secondary" />
            <div className="h-10 w-10 rounded-lg bg-accent" />
          </div>
          <h3 className="text-lg font-semibold">Colors</h3>
          <p className="text-sm text-muted-foreground">
            OKLCH color palette with semantic naming for consistent theming.
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-3">
          <div className="flex items-end gap-2">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-6 w-6 rounded bg-muted" />
            <div className="h-8 w-8 rounded bg-muted" />
            <div className="h-10 w-10 rounded bg-muted" />
          </div>
          <h3 className="text-lg font-semibold">Spacing</h3>
          <p className="text-sm text-muted-foreground">
            Consistent spacing scale based on a 4px base unit.
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-3">
          <div className="space-y-1">
            <p className="text-2xl font-bold">Aa</p>
            <p className="text-sm font-mono">Bb</p>
          </div>
          <h3 className="text-lg font-semibold">Typography</h3>
          <p className="text-sm text-muted-foreground">
            Font families, sizes, and weights for readable content.
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-3">
          <div className="flex gap-2">
            <div className="h-10 w-10 rounded-lg bg-white shadow-sm" />
            <div className="h-10 w-10 rounded-lg bg-white shadow-md" />
            <div className="h-10 w-10 rounded-lg bg-white shadow-lg" />
          </div>
          <h3 className="text-lg font-semibold">Shadows</h3>
          <p className="text-sm text-muted-foreground">
            Layered shadows for depth and visual hierarchy.
          </p>
        </div>
      </div>

      <div className="p-6 border rounded-lg bg-muted/50">
        <h3 className="text-lg font-semibold mb-2">Token Source</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Tokens are defined in{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
            packages/tokens/src/tokens/
          </code>{" "}
          and compiled using Style Dictionary.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
          <div className="p-2 rounded bg-background border">color.json</div>
          <div className="p-2 rounded bg-background border">spacing.json</div>
          <div className="p-2 rounded bg-background border">typography.json</div>
          <div className="p-2 rounded bg-background border">shadow.json</div>
        </div>
      </div>
    </div>
  ),
}
