import {
  Cursor,
  CursorFollow,
  CursorProvider,
} from "@repo/ui/components/animate-ui/components/animate/cursor"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/Cursor",
  component: CursorProvider,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof CursorProvider>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <CursorProvider className="relative flex items-center justify-center w-[400px] h-[300px] rounded-lg border bg-muted/30">
      <Cursor />
      <p className="text-muted-foreground text-sm">Hover inside this area</p>
    </CursorProvider>
  ),
}

export const WithFollowLabel: Story = {
  render: () => (
    <CursorProvider className="relative flex items-center justify-center w-[400px] h-[300px] rounded-lg border bg-muted/30">
      <Cursor />
      <CursorFollow>Click me</CursorFollow>
      <p className="text-muted-foreground text-sm">Move your cursor here</p>
    </CursorProvider>
  ),
}

export const WithContent: Story = {
  render: () => (
    <CursorProvider className="relative flex items-center justify-center w-[400px] h-[300px] rounded-lg border bg-muted/30">
      <Cursor />
      <CursorFollow>Drag to reorder</CursorFollow>
      <div className="flex flex-col gap-2">
        <Button variant="outline">Item 1</Button>
        <Button variant="outline">Item 2</Button>
        <Button variant="outline">Item 3</Button>
      </div>
    </CursorProvider>
  ),
}

export const CustomColor: Story = {
  render: () => (
    <CursorProvider className="relative flex items-center justify-center w-[400px] h-[300px] rounded-lg border bg-muted/30">
      <Cursor className="text-blue-500" />
      <p className="text-muted-foreground text-sm">Blue cursor</p>
    </CursorProvider>
  ),
}
