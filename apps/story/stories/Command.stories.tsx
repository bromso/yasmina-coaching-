import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@repo/ui/components/command"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Navigation/Command",
  component: Command,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    loop: {
      control: "boolean",
      description: "Whether keyboard navigation should loop from last item to first",
    },
  },
} satisfies Meta<typeof Command>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md md:min-w-[450px]">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Icon icon="lucide:calendar" className="mr-2 size-4" aria-hidden="true" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <Icon icon="lucide:smile" className="mr-2 size-4" aria-hidden="true" />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <Icon icon="lucide:calculator" className="mr-2 size-4" aria-hidden="true" />
            <span>Calculator</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <Icon icon="lucide:user" className="mr-2 size-4" aria-hidden="true" />
            <span>Profile</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Icon icon="lucide:credit-card" className="mr-2 size-4" aria-hidden="true" />
            <span>Billing</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Icon icon="lucide:settings" className="mr-2 size-4" aria-hidden="true" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText(/type a command or search/i)

    await expect(input).toBeInTheDocument()
    await expect(canvas.getByText("Calendar")).toBeVisible()

    await userEvent.type(input, "cal")
    await expect(canvas.getByText("Calendar")).toBeVisible()
  },
}

export const WithDialog: Story = {
  render: function Render() {
    const [open, setOpen] = React.useState(false)

    React.useEffect(() => {
      const down = (e: KeyboardEvent) => {
        if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          setOpen((open) => !open)
        }
      }
      document.addEventListener("keydown", down)
      return () => document.removeEventListener("keydown", down)
    }, [])

    return (
      <>
        <p className="text-muted-foreground text-sm">
          Press{" "}
          <kbd className="bg-muted pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </p>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem>
                <Icon icon="lucide:calendar" className="mr-2 size-4" aria-hidden="true" />
                <span>Calendar</span>
              </CommandItem>
              <CommandItem>
                <Icon icon="lucide:smile" className="mr-2 size-4" aria-hidden="true" />
                <span>Search Emoji</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </>
    )
  },
  play: async () => {
    // The sr-only title/description live inside DialogContent (inside its Portal), so while
    // closed they aren't mounted into the page at all — not an invisible <h2> ahead of whatever
    // page embeds this.
    expect(document.querySelector("h2")).toBeNull()
    await userEvent.keyboard("{Meta>}k{/Meta}")
    await expect(await within(document.body).findByRole("dialog")).toBeInTheDocument()
    expect(document.querySelector("h2")).toHaveTextContent("Command Palette")
  },
}

export const Simple: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          <CommandItem>Apple</CommandItem>
          <CommandItem>Banana</CommandItem>
          <CommandItem>Orange</CommandItem>
          <CommandItem>Pear</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}
