import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@repo/ui/components/animate-ui/components/radix/sidebar"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Sidebar>

export default meta
type Story = StoryObj<typeof meta>

const menuItems = [
  { label: "Home", icon: "lucide:home" },
  { label: "Inbox", icon: "lucide:inbox" },
  { label: "Documents", icon: "lucide:file-text" },
  { label: "Analytics", icon: "lucide:bar-chart" },
  { label: "Team", icon: "lucide:users" },
  { label: "Settings", icon: "lucide:settings" },
]

export const Default: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              A
            </div>
            <span className="text-sm font-semibold">Acme Inc</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton tooltip={item.label}>
                      <Icon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarSeparator />
          <div className="px-2 py-1 text-xs text-muted-foreground">v1.0.0</div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">Dashboard</span>
        </header>
        <div className="flex-1 p-6">
          <p className="text-muted-foreground">Main content area</p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
}

export const Floating: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar variant="floating">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              F
            </div>
            <span className="text-sm font-semibold">Floating</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.slice(0, 4).map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton tooltip={item.label}>
                      <Icon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">Floating Variant</span>
        </header>
        <div className="flex-1 p-6">
          <p className="text-muted-foreground">Content area with floating sidebar</p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
}

export const RightSide: Story = {
  render: () => (
    <SidebarProvider>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <span className="text-sm font-medium">Right Sidebar</span>
          <div className="ml-auto">
            <SidebarTrigger />
          </div>
        </header>
        <div className="flex-1 p-6">
          <p className="text-muted-foreground">Content area with sidebar on the right</p>
        </div>
      </SidebarInset>
      <Sidebar side="right">
        <SidebarHeader>
          <div className="px-2 py-1">
            <span className="text-sm font-semibold">Details</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Properties</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.slice(0, 3).map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton>
                      <Icon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ),
}

export const CollapsedByDefault: Story = {
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              C
            </div>
            <span className="text-sm font-semibold">Collapsed</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton tooltip={item.label}>
                      <Icon icon={item.icon} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">Collapsed Sidebar</span>
        </header>
        <div className="flex-1 p-6">
          <p className="text-muted-foreground">
            Sidebar is collapsed by default. Click the trigger or use Ctrl+B to expand.
          </p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
}
