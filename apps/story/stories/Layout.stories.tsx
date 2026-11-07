import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card"
import {
  Box,
  Container,
  Flex,
  FlexItem,
  Grid,
  HStack,
  Stack,
  VStack,
} from "@repo/ui/components/layout"
import { Separator } from "@repo/ui/components/separator"
import type { Meta, StoryObj } from "@storybook/react-vite"

/**
 * A comprehensive layout component system that mimics Material-UI's Grid system
 * but follows shadcn/ui coding patterns and uses Tailwind CSS.
 *
 * This system includes:
 * - **Grid**: 12-column responsive grid system
 * - **Container**: Max-width responsive container
 * - **Stack**: Vertical/horizontal stack with spacing
 * - **Flex**: Flexbox wrapper with common utilities
 * - **Box**: Generic wrapper with layout props
 */
const meta: Meta = {
  title: "Layout/Grid System",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: "A Material-UI-like Grid system built with Tailwind CSS and shadcn/ui patterns.",
      },
    },
  },
}

export default meta

// Helper component for demos
function DemoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border bg-card p-4 text-center ${className || ""}`}>{children}</div>
  )
}

// =============================================================================
// GRID STORIES
// =============================================================================

/**
 * Basic 12-column grid with responsive breakpoints.
 * Items take full width on mobile and split into columns on larger screens.
 */
export const BasicGrid: StoryObj = {
  render: () => (
    <Grid container spacing={4}>
      <Grid item xs={12} md={8}>
        <DemoCard>xs=12 md=8</DemoCard>
      </Grid>
      <Grid item xs={12} md={4}>
        <DemoCard>xs=12 md=4</DemoCard>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <DemoCard>xs=12 sm=6 md=4</DemoCard>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <DemoCard>xs=12 sm=6 md=4</DemoCard>
      </Grid>
      <Grid item xs={12} sm={12} md={4}>
        <DemoCard>xs=12 sm=12 md=4</DemoCard>
      </Grid>
    </Grid>
  ),
}

/**
 * Grid with different spacing values.
 */
export const GridSpacing: StoryObj = {
  render: () => (
    <Stack spacing={8}>
      <div>
        <p className="mb-2 text-sm text-muted-foreground">spacing=2</p>
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} item xs={6} md={3}>
              <DemoCard>Item {i}</DemoCard>
            </Grid>
          ))}
        </Grid>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">spacing=4</p>
        <Grid container spacing={4}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} item xs={6} md={3}>
              <DemoCard>Item {i}</DemoCard>
            </Grid>
          ))}
        </Grid>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">spacing=8</p>
        <Grid container spacing={8}>
          {[1, 2, 3, 4].map((i) => (
            <Grid key={i} item xs={6} md={3}>
              <DemoCard>Item {i}</DemoCard>
            </Grid>
          ))}
        </Grid>
      </div>
    </Stack>
  ),
}

/**
 * Nested grid layouts.
 */
export const NestedGrid: StoryObj = {
  render: () => (
    <Grid container spacing={4}>
      <Grid item xs={12} md={8}>
        <DemoCard className="bg-muted">
          <p className="mb-4">Main Content (md=8)</p>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <DemoCard className="bg-background">Nested 1</DemoCard>
            </Grid>
            <Grid item xs={6}>
              <DemoCard className="bg-background">Nested 2</DemoCard>
            </Grid>
            <Grid item xs={6}>
              <DemoCard className="bg-background">Nested 3</DemoCard>
            </Grid>
            <Grid item xs={6}>
              <DemoCard className="bg-background">Nested 4</DemoCard>
            </Grid>
          </Grid>
        </DemoCard>
      </Grid>
      <Grid item xs={12} md={4}>
        <DemoCard className="h-full">Sidebar (md=4)</DemoCard>
      </Grid>
    </Grid>
  ),
}

/**
 * Grid with alignment options.
 */
export const GridAlignment: StoryObj = {
  render: () => (
    <Stack spacing={8}>
      <div>
        <p className="mb-2 text-sm text-muted-foreground">alignItems="center"</p>
        <Grid container spacing={4} alignItems="center" className="min-h-32 bg-muted/50 rounded-lg">
          <Grid item xs={4}>
            <DemoCard className="h-20">Short</DemoCard>
          </Grid>
          <Grid item xs={4}>
            <DemoCard className="h-32">Tall</DemoCard>
          </Grid>
          <Grid item xs={4}>
            <DemoCard className="h-16">Medium</DemoCard>
          </Grid>
        </Grid>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">justifyContent="center"</p>
        <Grid container spacing={4} justifyContent="center" className="bg-muted/50 rounded-lg p-4">
          <Grid item span={3}>
            <DemoCard>Item 1</DemoCard>
          </Grid>
          <Grid item span={3}>
            <DemoCard>Item 2</DemoCard>
          </Grid>
        </Grid>
      </div>
    </Stack>
  ),
}

// =============================================================================
// CONTAINER STORIES
// =============================================================================

/**
 * Container with different max-width options.
 */
export const ContainerSizes: StoryObj = {
  render: () => (
    <Stack spacing={4}>
      {(["sm", "md", "lg", "xl", "2xl", "7xl"] as const).map((size) => (
        <Container key={size} maxWidth={size} className="bg-muted/50 rounded-lg">
          <Box py={4} className="text-center">
            maxWidth="{size}"
          </Box>
        </Container>
      ))}
    </Stack>
  ),
}

/**
 * Container with custom padding.
 */
export const ContainerPadding: StoryObj = {
  render: () => (
    <Stack spacing={4}>
      <Container maxWidth="lg" paddingY="lg" className="bg-muted/50 rounded-lg">
        <div className="text-center">Container with paddingY="lg"</div>
      </Container>
      <Container maxWidth="lg" paddingX="xl" paddingY="md" className="bg-muted/50 rounded-lg">
        <div className="text-center">Container with paddingX="xl" paddingY="md"</div>
      </Container>
    </Stack>
  ),
}

// =============================================================================
// STACK STORIES
// =============================================================================

/**
 * Vertical stack (default).
 */
export const VerticalStack: StoryObj = {
  render: () => (
    <Stack spacing={4}>
      <DemoCard>Item 1</DemoCard>
      <DemoCard>Item 2</DemoCard>
      <DemoCard>Item 3</DemoCard>
    </Stack>
  ),
}

/**
 * Horizontal stack.
 */
export const HorizontalStack: StoryObj = {
  render: () => (
    <HStack spacing={4}>
      <DemoCard>Item 1</DemoCard>
      <DemoCard>Item 2</DemoCard>
      <DemoCard>Item 3</DemoCard>
    </HStack>
  ),
}

/**
 * Stack with dividers.
 */
export const StackWithDivider: StoryObj = {
  render: () => (
    <Stack spacing={4} divider={<Separator />}>
      <div className="py-2">Section 1 content</div>
      <div className="py-2">Section 2 content</div>
      <div className="py-2">Section 3 content</div>
    </Stack>
  ),
}

/**
 * Stack with alignment.
 */
export const StackAlignment: StoryObj = {
  render: () => (
    <Grid container spacing={4}>
      <Grid item xs={12} md={4}>
        <p className="mb-2 text-sm text-muted-foreground">align="start"</p>
        <Stack align="start" spacing={2} className="bg-muted/50 p-4 rounded-lg min-h-40">
          <DemoCard className="w-20">Short</DemoCard>
          <DemoCard className="w-32">Medium</DemoCard>
          <DemoCard className="w-24">Small</DemoCard>
        </Stack>
      </Grid>
      <Grid item xs={12} md={4}>
        <p className="mb-2 text-sm text-muted-foreground">align="center"</p>
        <Stack align="center" spacing={2} className="bg-muted/50 p-4 rounded-lg min-h-40">
          <DemoCard className="w-20">Short</DemoCard>
          <DemoCard className="w-32">Medium</DemoCard>
          <DemoCard className="w-24">Small</DemoCard>
        </Stack>
      </Grid>
      <Grid item xs={12} md={4}>
        <p className="mb-2 text-sm text-muted-foreground">align="end"</p>
        <Stack align="end" spacing={2} className="bg-muted/50 p-4 rounded-lg min-h-40">
          <DemoCard className="w-20">Short</DemoCard>
          <DemoCard className="w-32">Medium</DemoCard>
          <DemoCard className="w-24">Small</DemoCard>
        </Stack>
      </Grid>
    </Grid>
  ),
}

// =============================================================================
// FLEX STORIES
// =============================================================================

/**
 * Basic Flex container.
 */
export const BasicFlex: StoryObj = {
  render: () => (
    <Flex gap={4}>
      <DemoCard>Item 1</DemoCard>
      <DemoCard>Item 2</DemoCard>
      <DemoCard>Item 3</DemoCard>
    </Flex>
  ),
}

/**
 * Flex with space-between.
 */
export const FlexSpaceBetween: StoryObj = {
  render: () => (
    <Flex justify="between" align="center" className="bg-muted/50 p-4 rounded-lg">
      <span className="font-medium">Logo</span>
      <Flex gap={4}>
        <span>Home</span>
        <span>About</span>
        <span>Contact</span>
      </Flex>
      <button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Sign In
      </button>
    </Flex>
  ),
}

/**
 * FlexItem with grow and shrink.
 */
export const FlexItemGrowShrink: StoryObj = {
  render: () => (
    <Flex gap={4}>
      <FlexItem shrink={false} className="w-48">
        <DemoCard>Fixed width sidebar</DemoCard>
      </FlexItem>
      <FlexItem grow>
        <DemoCard>Flexible main content area that grows to fill space</DemoCard>
      </FlexItem>
      <FlexItem shrink={false} className="w-48">
        <DemoCard>Fixed width aside</DemoCard>
      </FlexItem>
    </Flex>
  ),
}

// =============================================================================
// BOX STORIES
// =============================================================================

/**
 * Box with padding and margin.
 */
export const BoxSpacing: StoryObj = {
  render: () => (
    <div className="bg-muted/30 p-2">
      <Box p={6} m={4} bg="card" rounded="lg" border="default">
        <p>Box with p=6, m=4, rounded corners, and border</p>
      </Box>
    </div>
  ),
}

/**
 * Box with different backgrounds.
 */
export const BoxBackgrounds: StoryObj = {
  render: () => (
    <Grid container spacing={4}>
      {(["background", "card", "muted", "primary", "secondary", "accent"] as const).map((bg) => (
        <Grid key={bg} item xs={6} md={4}>
          <Box
            p={4}
            rounded="lg"
            bg={bg}
            color={bg === "primary" ? "inherit" : undefined}
            className={bg === "primary" ? "text-primary-foreground" : ""}
          >
            bg="{bg}"
          </Box>
        </Grid>
      ))}
    </Grid>
  ),
}

/**
 * Box with shadows.
 */
export const BoxShadows: StoryObj = {
  render: () => (
    <Flex gap={6} wrap="wrap">
      {(["none", "sm", "md", "lg", "xl", "2xl"] as const).map((shadow) => (
        <Box key={shadow} p={6} rounded="lg" bg="card" shadow={shadow}>
          shadow="{shadow}"
        </Box>
      ))}
    </Flex>
  ),
}

// =============================================================================
// COMPLETE EXAMPLE
// =============================================================================

/**
 * A complete page layout example combining all components.
 */
export const CompletePageLayout: StoryObj = {
  render: () => (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Box as="header" py={4} border="default" className="border-t-0 border-x-0">
        <Container maxWidth="7xl">
          <Flex justify="between" align="center">
            <span className="text-xl font-bold">Logo</span>
            <HStack spacing={6}>
              <span>Products</span>
              <span>Solutions</span>
              <span>Pricing</span>
              <span>Docs</span>
            </HStack>
            <HStack spacing={2}>
              <button type="button" className="rounded-md px-4 py-2 hover:bg-muted">
                Log in
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
              >
                Sign up
              </button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Main Content */}
      <Container maxWidth="7xl" paddingY="lg">
        <Grid container spacing={6}>
          {/* Sidebar */}
          <Grid item xs={12} lg={3}>
            <Card>
              <CardHeader>
                <CardTitle>Navigation</CardTitle>
              </CardHeader>
              <CardContent>
                <VStack spacing={2} align="stretch">
                  <Box p={2} rounded="md" bg="accent">
                    Dashboard
                  </Box>
                  <Box p={2} rounded="md" className="hover:bg-muted cursor-pointer">
                    Analytics
                  </Box>
                  <Box p={2} rounded="md" className="hover:bg-muted cursor-pointer">
                    Reports
                  </Box>
                  <Box p={2} rounded="md" className="hover:bg-muted cursor-pointer">
                    Settings
                  </Box>
                </VStack>
              </CardContent>
            </Card>
          </Grid>

          {/* Main Area */}
          <Grid item xs={12} lg={9}>
            <Stack spacing={6}>
              {/* Stats Row */}
              <Grid container spacing={4}>
                {["Revenue", "Users", "Orders", "Growth"].map((stat) => (
                  <Grid key={stat} item xs={6} md={3}>
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">{stat}</p>
                        <p className="text-2xl font-bold">$12,345</p>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {/* Content Cards */}
              <Grid container spacing={4}>
                <Grid item xs={12} md={8}>
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>Main Chart</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box
                        h="full"
                        p={8}
                        rounded="lg"
                        bg="muted"
                        display="flex"
                        className="items-center justify-center min-h-64"
                      >
                        Chart Placeholder
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Stack spacing={3} divider={<Separator />}>
                        {[1, 2, 3, 4].map((i) => (
                          <Flex key={i} gap={3} align="center">
                            <Box
                              w="fit"
                              h="fit"
                              p={2}
                              rounded="full"
                              bg="primary"
                              className="text-primary-foreground text-xs"
                            >
                              U{i}
                            </Box>
                            <div>
                              <p className="text-sm font-medium">User action {i}</p>
                              <p className="text-xs text-muted-foreground">2 hours ago</p>
                            </div>
                          </Flex>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Stack>
          </Grid>
        </Grid>
      </Container>

      {/* Footer */}
      <Box as="footer" py={8} bg="muted" mt={12}>
        <Container maxWidth="7xl">
          <Flex justify="between" align="center">
            <span className="text-muted-foreground">© 2025 Company. All rights reserved.</span>
            <HStack spacing={6}>
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                Privacy
              </span>
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                Terms
              </span>
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                Contact
              </span>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </div>
  ),
}
