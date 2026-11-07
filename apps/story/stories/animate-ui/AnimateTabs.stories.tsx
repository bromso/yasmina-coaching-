import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/animate-ui/components/animate/tabs"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tabs>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContents>
        <TabsContent value="account">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium mb-2">Account Settings</h3>
            <p className="text-sm text-muted-foreground">
              Manage your account details and preferences.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="password">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium mb-2">Password</h3>
            <p className="text-sm text-muted-foreground">
              Change your password and security settings.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium mb-2">General Settings</h3>
            <p className="text-sm text-muted-foreground">
              Configure your general application preferences.
            </p>
          </div>
        </TabsContent>
      </TabsContents>
    </Tabs>
  ),
}

export const TwoTabs: Story = {
  render: () => (
    <Tabs defaultValue="preview">
      <TabsList>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContents>
        <TabsContent value="preview">
          <div className="rounded-lg border p-6 flex items-center justify-center min-h-[100px]">
            <p className="text-muted-foreground">Component preview area</p>
          </div>
        </TabsContent>
        <TabsContent value="code">
          <div className="rounded-lg border bg-muted/50 p-4 font-mono text-sm min-h-[100px]">
            {"<Button>Click me</Button>"}
          </div>
        </TabsContent>
      </TabsContents>
    </Tabs>
  ),
}

export const ManyTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>
      <TabsContents>
        <TabsContent value="overview">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Overview content</p>
          </div>
        </TabsContent>
        <TabsContent value="analytics">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Analytics content</p>
          </div>
        </TabsContent>
        <TabsContent value="reports">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Reports content</p>
          </div>
        </TabsContent>
        <TabsContent value="notifications">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Notifications content</p>
          </div>
        </TabsContent>
      </TabsContents>
    </Tabs>
  ),
}
