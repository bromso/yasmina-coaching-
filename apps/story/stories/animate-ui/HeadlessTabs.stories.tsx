import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@repo/ui/components/animate-ui/components/headless/tabs"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Headless/Tabs",
  component: TabGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TabGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <TabGroup className="w-[400px]">
      <TabList>
        <Tab index={0}>Account</Tab>
        <Tab index={1}>Password</Tab>
        <Tab index={2}>Settings</Tab>
      </TabList>
      <TabPanels>
        <TabPanel index={0}>
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Account</h3>
            <p className="text-sm text-muted-foreground">
              Manage your account settings and preferences.
            </p>
          </div>
        </TabPanel>
        <TabPanel index={1}>
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Password</h3>
            <p className="text-sm text-muted-foreground">
              Change your password and security settings.
            </p>
          </div>
        </TabPanel>
        <TabPanel index={2}>
          <div className="space-y-2 p-4">
            <h3 className="text-sm font-medium">Settings</h3>
            <p className="text-sm text-muted-foreground">Configure your application preferences.</p>
          </div>
        </TabPanel>
      </TabPanels>
    </TabGroup>
  ),
}

export const TwoTabs: Story = {
  render: () => (
    <TabGroup className="w-[400px]">
      <TabList>
        <Tab index={0}>Overview</Tab>
        <Tab index={1}>Analytics</Tab>
      </TabList>
      <TabPanels>
        <TabPanel index={0}>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Overview content goes here.</p>
          </div>
        </TabPanel>
        <TabPanel index={1}>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Analytics content goes here.</p>
          </div>
        </TabPanel>
      </TabPanels>
    </TabGroup>
  ),
}

export const DefaultIndex: Story = {
  render: () => (
    <TabGroup defaultIndex={1} className="w-[400px]">
      <TabList>
        <Tab index={0}>First</Tab>
        <Tab index={1}>Second (default)</Tab>
        <Tab index={2}>Third</Tab>
      </TabList>
      <TabPanels>
        <TabPanel index={0}>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">First tab content.</p>
          </div>
        </TabPanel>
        <TabPanel index={1}>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              This tab is selected by default using defaultIndex.
            </p>
          </div>
        </TabPanel>
        <TabPanel index={2}>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Third tab content.</p>
          </div>
        </TabPanel>
      </TabPanels>
    </TabGroup>
  ),
}
