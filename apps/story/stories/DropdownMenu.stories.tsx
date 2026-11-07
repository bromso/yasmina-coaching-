import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Navigation/DropdownMenu",
  component: DropdownMenu,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    modal: {
      control: "boolean",
      description: "Whether the dropdown menu should be modal",
    },
  },
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Icon icon="lucide:user" aria-hidden="true" />
            <span>Profile</span>
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon icon="lucide:credit-card" aria-hidden="true" />
            <span>Billing</span>
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon icon="lucide:settings" aria-hidden="true" />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Icon icon="lucide:log-out" aria-hidden="true" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /open menu/i })

    await expect(trigger).toBeInTheDocument()
    await userEvent.click(trigger)

    const menu = await within(document.body).findByRole("menu")
    await expect(menu).toBeInTheDocument()
    await expect(within(menu).getByText("My Account")).toBeInTheDocument()
    await expect(within(menu).getByText("Profile")).toBeInTheDocument()
  },
}

export const WithCheckboxes: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">View Options</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Status Bar</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Activity Bar</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Panel</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithRadioGroup: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Select Theme</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="system">
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithSubmenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem>
          <Icon icon="lucide:plus" aria-hidden="true" />
          <span>New Tab</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon icon="lucide:user-plus" aria-hidden="true" />
            <span>Invite users</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>
              <Icon icon="lucide:mail" aria-hidden="true" />
              <span>Email</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Icon icon="lucide:message-square" aria-hidden="true" />
              <span>Message</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Icon icon="lucide:plus-circle" aria-hidden="true" />
              <span>More...</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Icon icon="lucide:cloud" aria-hidden="true" />
          <span>API (Coming soon)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}
