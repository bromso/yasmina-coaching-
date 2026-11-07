"use client"

import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

/**
 * Spacing scale mapping (1-12) to Tailwind gap classes.
 * Uses Tailwind's default spacing scale.
 */
const spacingMap = {
  0: "gap-0",
  0.5: "gap-0.5",
  1: "gap-1",
  1.5: "gap-1.5",
  2: "gap-2",
  2.5: "gap-2.5",
  3: "gap-3",
  3.5: "gap-3.5",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  7: "gap-7",
  8: "gap-8",
  9: "gap-9",
  10: "gap-10",
  11: "gap-11",
  12: "gap-12",
} as const

/**
 * Column span mapping for 12-column grid system.
 */
const columnSpanMap = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
  auto: "col-auto",
  full: "col-span-full",
} as const

/**
 * Responsive column span prefixes for each breakpoint.
 */
const responsiveColumnMap = {
  xs: {
    1: "xs:col-span-1",
    2: "xs:col-span-2",
    3: "xs:col-span-3",
    4: "xs:col-span-4",
    5: "xs:col-span-5",
    6: "xs:col-span-6",
    7: "xs:col-span-7",
    8: "xs:col-span-8",
    9: "xs:col-span-9",
    10: "xs:col-span-10",
    11: "xs:col-span-11",
    12: "xs:col-span-12",
    auto: "xs:col-auto",
    full: "xs:col-span-full",
  },
  sm: {
    1: "sm:col-span-1",
    2: "sm:col-span-2",
    3: "sm:col-span-3",
    4: "sm:col-span-4",
    5: "sm:col-span-5",
    6: "sm:col-span-6",
    7: "sm:col-span-7",
    8: "sm:col-span-8",
    9: "sm:col-span-9",
    10: "sm:col-span-10",
    11: "sm:col-span-11",
    12: "sm:col-span-12",
    auto: "sm:col-auto",
    full: "sm:col-span-full",
  },
  md: {
    1: "md:col-span-1",
    2: "md:col-span-2",
    3: "md:col-span-3",
    4: "md:col-span-4",
    5: "md:col-span-5",
    6: "md:col-span-6",
    7: "md:col-span-7",
    8: "md:col-span-8",
    9: "md:col-span-9",
    10: "md:col-span-10",
    11: "md:col-span-11",
    12: "md:col-span-12",
    auto: "md:col-auto",
    full: "md:col-span-full",
  },
  lg: {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
    5: "lg:col-span-5",
    6: "lg:col-span-6",
    7: "lg:col-span-7",
    8: "lg:col-span-8",
    9: "lg:col-span-9",
    10: "lg:col-span-10",
    11: "lg:col-span-11",
    12: "lg:col-span-12",
    auto: "lg:col-auto",
    full: "lg:col-span-full",
  },
  xl: {
    1: "xl:col-span-1",
    2: "xl:col-span-2",
    3: "xl:col-span-3",
    4: "xl:col-span-4",
    5: "xl:col-span-5",
    6: "xl:col-span-6",
    7: "xl:col-span-7",
    8: "xl:col-span-8",
    9: "xl:col-span-9",
    10: "xl:col-span-10",
    11: "xl:col-span-11",
    12: "xl:col-span-12",
    auto: "xl:col-auto",
    full: "xl:col-span-full",
  },
  "2xl": {
    1: "2xl:col-span-1",
    2: "2xl:col-span-2",
    3: "2xl:col-span-3",
    4: "2xl:col-span-4",
    5: "2xl:col-span-5",
    6: "2xl:col-span-6",
    7: "2xl:col-span-7",
    8: "2xl:col-span-8",
    9: "2xl:col-span-9",
    10: "2xl:col-span-10",
    11: "2xl:col-span-11",
    12: "2xl:col-span-12",
    auto: "2xl:col-auto",
    full: "2xl:col-span-full",
  },
} as const

const gridContainerVariants = cva("grid", {
  variants: {
    /**
     * Number of columns in the grid.
     * @default 12
     */
    columns: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
      7: "grid-cols-7",
      8: "grid-cols-8",
      9: "grid-cols-9",
      10: "grid-cols-10",
      11: "grid-cols-11",
      12: "grid-cols-12",
      none: "grid-cols-none",
    },
    /**
     * Horizontal alignment of grid items.
     */
    justifyItems: {
      start: "justify-items-start",
      end: "justify-items-end",
      center: "justify-items-center",
      stretch: "justify-items-stretch",
    },
    /**
     * Vertical alignment of grid items.
     */
    alignItems: {
      start: "items-start",
      end: "items-end",
      center: "items-center",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    /**
     * Distribution of content along the main axis.
     */
    justifyContent: {
      start: "justify-start",
      end: "justify-end",
      center: "justify-center",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
      stretch: "justify-stretch",
    },
    /**
     * Distribution of content along the cross axis.
     */
    alignContent: {
      start: "content-start",
      end: "content-end",
      center: "content-center",
      between: "content-between",
      around: "content-around",
      evenly: "content-evenly",
      stretch: "content-stretch",
    },
    /**
     * Grid auto-flow direction.
     */
    flow: {
      row: "grid-flow-row",
      col: "grid-flow-col",
      dense: "grid-flow-dense",
      rowDense: "grid-flow-row-dense",
      colDense: "grid-flow-col-dense",
    },
  },
  defaultVariants: {
    columns: 12,
  },
})

const gridItemVariants = cva("", {
  variants: {
    /**
     * Alignment of this specific item.
     */
    alignSelf: {
      auto: "self-auto",
      start: "self-start",
      end: "self-end",
      center: "self-center",
      stretch: "self-stretch",
      baseline: "self-baseline",
    },
    /**
     * Justification of this specific item.
     */
    justifySelf: {
      auto: "justify-self-auto",
      start: "justify-self-start",
      end: "justify-self-end",
      center: "justify-self-center",
      stretch: "justify-self-stretch",
    },
  },
})

/** Valid column span values */
type ColumnSpan = keyof typeof columnSpanMap

/** Valid spacing values */
type Spacing = keyof typeof spacingMap

/** Valid breakpoint names */
type Breakpoint = keyof typeof responsiveColumnMap

/**
 * Props for Grid container mode.
 */
interface GridContainerProps extends VariantProps<typeof gridContainerVariants> {
  /**
   * Render as a grid container.
   */
  container: true
  /**
   * Gap between grid items (1-12 scale).
   */
  spacing?: Spacing
  /**
   * Horizontal gap between grid items.
   */
  spacingX?: Spacing
  /**
   * Vertical gap between grid items.
   */
  spacingY?: Spacing
}

/**
 * Props for Grid item mode.
 */
interface GridItemProps extends VariantProps<typeof gridItemVariants> {
  /**
   * Render as a grid item.
   */
  item: true
  /**
   * Base column span (applies to all breakpoints unless overridden).
   */
  span?: ColumnSpan
  /**
   * Column span at xs breakpoint (0px+).
   */
  xs?: ColumnSpan
  /**
   * Column span at sm breakpoint (640px+).
   */
  sm?: ColumnSpan
  /**
   * Column span at md breakpoint (768px+).
   */
  md?: ColumnSpan
  /**
   * Column span at lg breakpoint (1024px+).
   */
  lg?: ColumnSpan
  /**
   * Column span at xl breakpoint (1280px+).
   */
  xl?: ColumnSpan
  /**
   * Column span at 2xl breakpoint (1536px+).
   */
  "2xl"?: ColumnSpan
  /**
   * Starting column position.
   */
  colStart?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | "auto"
  /**
   * Ending column position.
   */
  colEnd?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | "auto"
}

/**
 * Base props shared by all Grid variants.
 */
interface GridBaseProps {
  /**
   * Additional CSS classes.
   */
  className?: string
  /**
   * Child elements.
   */
  children?: React.ReactNode
  /**
   * HTML element or component to render as.
   * @default "div"
   */
  as?: React.ElementType
}

/**
 * Combined Grid props - can be container, item, or both.
 */
type GridProps = GridBaseProps &
  (
    | GridContainerProps
    | GridItemProps
    | (Omit<GridContainerProps, "container"> &
        Omit<GridItemProps, "item"> & { container?: true; item?: true })
  ) &
  Omit<React.HTMLAttributes<HTMLElement>, "children">

/**
 * Get spacing classes based on spacing props.
 */
function getSpacingClasses(spacing?: Spacing, spacingX?: Spacing, spacingY?: Spacing): string {
  const classes: string[] = []

  if (spacing !== undefined && spacingX === undefined && spacingY === undefined) {
    classes.push(spacingMap[spacing])
  } else {
    if (spacingX !== undefined) {
      classes.push(spacingMap[spacingX].replace("gap-", "gap-x-"))
    }
    if (spacingY !== undefined) {
      classes.push(spacingMap[spacingY].replace("gap-", "gap-y-"))
    }
  }

  return classes.join(" ")
}

/**
 * Get responsive column span classes based on breakpoint props.
 */
function getResponsiveColumnClasses(props: {
  span?: ColumnSpan
  xs?: ColumnSpan
  sm?: ColumnSpan
  md?: ColumnSpan
  lg?: ColumnSpan
  xl?: ColumnSpan
  "2xl"?: ColumnSpan
}): string {
  const classes: string[] = []

  // Base span (no prefix)
  if (props.span !== undefined) {
    classes.push(columnSpanMap[props.span])
  }

  // Responsive spans
  const breakpoints: Breakpoint[] = ["xs", "sm", "md", "lg", "xl", "2xl"]
  for (const bp of breakpoints) {
    const value = props[bp]
    if (value !== undefined) {
      classes.push(responsiveColumnMap[bp][value])
    }
  }

  return classes.join(" ")
}

/**
 * Get column start/end classes.
 */
function getColumnPositionClasses(
  colStart?: GridItemProps["colStart"],
  colEnd?: GridItemProps["colEnd"]
): string {
  const classes: string[] = []

  if (colStart !== undefined) {
    classes.push(colStart === "auto" ? "col-start-auto" : `col-start-${colStart}`)
  }
  if (colEnd !== undefined) {
    classes.push(colEnd === "auto" ? "col-end-auto" : `col-end-${colEnd}`)
  }

  return classes.join(" ")
}

/**
 * A flexible grid component that supports both container and item modes.
 *
 * Similar to Material-UI's Grid component, it provides a 12-column grid system
 * with responsive breakpoints and flexible spacing options.
 *
 * @example
 * // Basic grid layout
 * <Grid container spacing={4}>
 *   <Grid item xs={12} md={6}>
 *     <Card>Left column</Card>
 *   </Grid>
 *   <Grid item xs={12} md={6}>
 *     <Card>Right column</Card>
 *   </Grid>
 * </Grid>
 *
 * @example
 * // Nested grids
 * <Grid container spacing={4}>
 *   <Grid item xs={12} md={8}>
 *     <Grid container spacing={2}>
 *       <Grid item xs={6}><Card /></Grid>
 *       <Grid item xs={6}><Card /></Grid>
 *     </Grid>
 *   </Grid>
 *   <Grid item xs={12} md={4}>
 *     <Card>Sidebar</Card>
 *   </Grid>
 * </Grid>
 */
const Grid = React.forwardRef<HTMLElement, GridProps>(
  ({ as: Component = "div", className, children, ...props }, ref) => {
    const isContainer = "container" in props && props.container
    const isItem = "item" in props && props.item

    // Extract container props
    const containerProps = isContainer
      ? {
          columns: (props as GridContainerProps).columns,
          justifyItems: (props as GridContainerProps).justifyItems,
          alignItems: (props as GridContainerProps).alignItems,
          justifyContent: (props as GridContainerProps).justifyContent,
          alignContent: (props as GridContainerProps).alignContent,
          flow: (props as GridContainerProps).flow,
        }
      : {}

    // Extract item props
    const itemProps = isItem
      ? {
          alignSelf: (props as GridItemProps).alignSelf,
          justifySelf: (props as GridItemProps).justifySelf,
        }
      : {}

    // Build class names
    const containerClasses = isContainer ? gridContainerVariants(containerProps) : ""

    const spacingClasses = isContainer
      ? getSpacingClasses(
          (props as GridContainerProps).spacing,
          (props as GridContainerProps).spacingX,
          (props as GridContainerProps).spacingY
        )
      : ""

    const itemClasses = isItem ? gridItemVariants(itemProps) : ""

    const columnClasses = isItem
      ? getResponsiveColumnClasses({
          span: (props as GridItemProps).span,
          xs: (props as GridItemProps).xs,
          sm: (props as GridItemProps).sm,
          md: (props as GridItemProps).md,
          lg: (props as GridItemProps).lg,
          xl: (props as GridItemProps).xl,
          "2xl": (props as GridItemProps)["2xl"],
        })
      : ""

    const positionClasses = isItem
      ? getColumnPositionClasses((props as GridItemProps).colStart, (props as GridItemProps).colEnd)
      : ""

    // Filter out Grid-specific props from DOM
    const {
      container,
      item,
      spacing,
      spacingX,
      spacingY,
      columns,
      justifyItems,
      alignItems,
      justifyContent,
      alignContent,
      flow,
      span,
      xs,
      sm,
      md,
      lg,
      xl,
      alignSelf,
      justifySelf,
      colStart,
      colEnd,
      ...domProps
    } = props as GridContainerProps &
      GridItemProps & { container?: boolean; item?: boolean; "2xl"?: ColumnSpan }

    return (
      <Component
        ref={ref}
        className={cn(
          containerClasses,
          spacingClasses,
          itemClasses,
          columnClasses,
          positionClasses,
          className
        )}
        {...domProps}
      >
        {children}
      </Component>
    )
  }
)
Grid.displayName = "Grid"

export type { ColumnSpan, GridContainerProps, GridItemProps, GridProps, Spacing }
export { Grid, gridContainerVariants, gridItemVariants }
