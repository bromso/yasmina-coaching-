/**
 * Layout Components
 *
 * A comprehensive layout component system that mimics Material-UI's Grid system
 * but follows shadcn/ui coding patterns and uses Tailwind CSS.
 *
 * @example
 * import { Grid, Container, Stack, Flex, Box } from "@repo/ui/components/layout"
 *
 * // Grid layout
 * <Grid container spacing={4}>
 *   <Grid item xs={12} md={6}>Left column</Grid>
 *   <Grid item xs={12} md={6}>Right column</Grid>
 * </Grid>
 *
 * // Stack layout
 * <Stack spacing={4}>
 *   <Card>Item 1</Card>
 *   <Card>Item 2</Card>
 * </Stack>
 *
 * // Container
 * <Container maxWidth="lg">
 *   <Content />
 * </Container>
 */

export {
  Box,
  type BoxProps,
  boxVariants,
} from "./box.js"

export {
  Container,
  type ContainerProps,
  containerVariants,
} from "./container.js"
export {
  Flex,
  FlexItem,
  type FlexItemProps,
  type FlexProps,
  flexVariants,
} from "./flex.js"
export {
  type ColumnSpan,
  Grid,
  type GridContainerProps,
  type GridItemProps,
  type GridProps,
  gridContainerVariants,
  gridItemVariants,
  type Spacing,
} from "./grid.js"
export {
  HStack,
  Stack,
  type StackProps,
  stackVariants,
  VStack,
} from "./stack.js"
