import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/animate-ui/components/radix/tabs"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Tabs",
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
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContents>
        <TabsContent value="account">
          <div className="space-y-2 pt-2">
            <h3 className="text-lg font-medium">Account</h3>
            <p className="text-sm text-muted-foreground">
              Make changes to your account here. Click save when you are done.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="password">
          <div className="space-y-2 pt-2">
            <h3 className="text-lg font-medium">Password</h3>
            <p className="text-sm text-muted-foreground">
              Change your password here. After saving, you will be logged out.
            </p>
          </div>
        </TabsContent>
      </TabsContents>
    </Tabs>
  ),
}

export const ThreeTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContents>
        <TabsContent value="overview">
          <p className="text-sm text-muted-foreground pt-2">
            Overview content goes here with a summary of key metrics.
          </p>
        </TabsContent>
        <TabsContent value="analytics">
          <p className="text-sm text-muted-foreground pt-2">
            Analytics content with charts and data visualizations.
          </p>
        </TabsContent>
        <TabsContent value="reports">
          <p className="text-sm text-muted-foreground pt-2">
            Reports content with downloadable documents and exports.
          </p>
        </TabsContent>
      </TabsContents>
    </Tabs>
  ),
}

export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="other">Other</TabsTrigger>
      </TabsList>
      <TabsContents>
        <TabsContent value="active">
          <p className="text-sm text-muted-foreground pt-2">
            This tab is active. The middle tab is disabled.
          </p>
        </TabsContent>
        <TabsContent value="other">
          <p className="text-sm text-muted-foreground pt-2">Other tab content.</p>
        </TabsContent>
      </TabsContents>
    </Tabs>
  ),
}
