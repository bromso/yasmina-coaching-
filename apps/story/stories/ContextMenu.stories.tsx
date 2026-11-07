import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@repo/ui/components/context-menu"
import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Navigation/ContextMenu",
  component: ContextMenu,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    modal: {
      control: "boolean",
      description: "Whether the context menu should be modal",
    },
  },
} satisfies Meta<typeof ContextMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
        Right click here
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem>
          Back
          <ContextMenuShortcut>⌘[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled>
          Forward
          <ContextMenuShortcut>⌘]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          Reload
          <ContextMenuShortcut>⌘R</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>More Tools</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem>
              Save Page As...
              <ContextMenuShortcut>⇧⌘S</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>Create Shortcut...</ContextMenuItem>
            <ContextMenuItem>Name Window...</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>Developer Tools</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem>
          View Page Source
          <ContextMenuShortcut>⌘U</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>Inspect</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByText(/right click here/i)

    await expect(trigger).toBeInTheDocument()
    await userEvent.pointer({ keys: "[MouseRight]", target: trigger })

    const menu = await within(document.body).findByRole("menu")
    await expect(menu).toBeInTheDocument()
    await expect(within(menu).getByText("Back")).toBeInTheDocument()
  },
}

export const WithCheckboxes: Story = {
  render: function Render() {
    const [showStatusBar, setShowStatusBar] = React.useState(true)
    const [showPanel, setShowPanel] = React.useState(false)

    return (
      <ContextMenu>
        <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right click here
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuLabel>Appearance</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked={showStatusBar} onCheckedChange={setShowStatusBar}>
            Status Bar
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem checked={showPanel} onCheckedChange={setShowPanel}>
            Panel
          </ContextMenuCheckboxItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  },
}

export const WithRadioItems: Story = {
  render: function Render() {
    const [person, setPerson] = React.useState("pedro")

    return (
      <ContextMenu>
        <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right click here
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuLabel>People</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuRadioGroup value={person} onValueChange={setPerson}>
            <ContextMenuRadioItem value="pedro">Pedro Duarte</ContextMenuRadioItem>
            <ContextMenuRadioItem value="colm">Colm Tuite</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuContent>
      </ContextMenu>
    )
  },
}
