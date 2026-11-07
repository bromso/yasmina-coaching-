import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsPanels,
  TabsTab,
} from "@repo/ui/components/animate-ui/components/base/tabs"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTab value="account">Account</TabsTab>
        <TabsTab value="password">Password</TabsTab>
        <TabsTab value="settings">Settings</TabsTab>
      </TabsList>
      <TabsPanels>
        <TabsPanel value="account">
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Account</h3>
            <p className="text-sm text-muted-foreground">
              Manage your account settings and preferences.
            </p>
          </div>
        </TabsPanel>
        <TabsPanel value="password">
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Password</h3>
            <p className="text-sm text-muted-foreground">
              Change your password and security settings.
            </p>
          </div>
        </TabsPanel>
        <TabsPanel value="settings">
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Settings</h3>
            <p className="text-sm text-muted-foreground">Configure your application preferences.</p>
          </div>
        </TabsPanel>
      </TabsPanels>
    </Tabs>
  ),
}

export const TwoTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTab value="overview">Overview</TabsTab>
        <TabsTab value="analytics">Analytics</TabsTab>
      </TabsList>
      <TabsPanels>
        <TabsPanel value="overview">
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Overview content goes here.</p>
          </div>
        </TabsPanel>
        <TabsPanel value="analytics">
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Analytics content goes here.</p>
          </div>
        </TabsPanel>
      </TabsPanels>
    </Tabs>
  ),
}
