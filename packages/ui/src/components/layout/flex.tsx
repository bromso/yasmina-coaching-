"use client"

import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const flexVariants = cva("flex", {
  variants: {
    /**
     * Flex direction.
     */
    direction: {
      row: "flex-row",
      rowReverse: "flex-row-reverse",
      col: "flex-col",
      colReverse: "flex-col-reverse",
    },
    /**
     * Flex wrap behavior.
     */
    wrap: {
      nowrap: "flex-nowrap",
      wrap: "flex-wrap",
      wrapReverse: "flex-wrap-reverse",
    },
    /**
     * Align items on the cross axis.
     */
    align: {
      start: "items-start",
      end: "items-end",
      center: "items-center",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    /**
     * Justify content on the main axis.
     */
    justify: {
      start: "justify-start",
      end: "justify-end",
      center: "justify-center",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
      stretch: "justify-stretch",
    },
    /**
     * Gap between flex items.
     */
    gap: {
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
      14: "gap-14",
      16: "gap-16",
      20: "gap-20",
    },
    /**
     * Horizontal gap between flex items.
     */
    gapX: {
      0: "gap-x-0",
      0.5: "gap-x-0.5",
      1: "gap-x-1",
      1.5: "gap-x-1.5",
      2: "gap-x-2",
      2.5: "gap-x-2.5",
      3: "gap-x-3",
      3.5: "gap-x-3.5",
      4: "gap-x-4",
      5: "gap-x-5",
      6: "gap-x-6",
      7: "gap-x-7",
      8: "gap-x-8",
      9: "gap-x-9",
      10: "gap-x-10",
      11: "gap-x-11",
      12: "gap-x-12",
    },
    /**
     * Vertical gap between flex items.
     */
    gapY: {
      0: "gap-y-0",
      0.5: "gap-y-0.5",
      1: "gap-y-1",
      1.5: "gap-y-1.5",
      2: "gap-y-2",
      2.5: "gap-y-2.5",
      3: "gap-y-3",
      3.5: "gap-y-3.5",
      4: "gap-y-4",
      5: "gap-y-5",
      6: "gap-y-6",
      7: "gap-y-7",
      8: "gap-y-8",
      9: "gap-y-9",
      10: "gap-y-10",
      11: "gap-y-11",
      12: "gap-y-12",
    },
    /**
     * Whether to use inline-flex.
     */
    inline: {
      true: "inline-flex",
      false: "",
    },
    /**
     * Whether the flex container should take full width.
     */
    fullWidth: {
      true: "w-full",
      false: "",
    },
    /**
     * Whether the flex container should take full height.
     */
    fullHeight: {
      true: "h-full",
      false: "",
    },
    /**
     * Flex grow behavior for the container.
     */
    grow: {
      true: "grow",
      false: "grow-0",
    },
    /**
     * Flex shrink behavior for the container.
     */
    shrink: {
      true: "shrink",
      false: "shrink-0",
    },
  },
  defaultVariants: {
    direction: "row",
    wrap: "nowrap",
    align: "stretch",
    justify: "start",
    inline: false,
    fullWidth: false,
    fullHeight: false,
  },
  compoundVariants: [
    {
      inline: true,
      className: "inline-flex",
    },
  ],
})

/**
 * Props for the Flex component.
 */
interface FlexProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children">,
    VariantProps<typeof flexVariants> {
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
 * A flexible flexbox container component with common layout utilities.
 *
 * @example
 * // Basic flex container
 * <Flex gap={4}>
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </Flex>
 *
 * @example
 * // Centered content
 * <Flex align="center" justify="center" fullHeight>
 *   <Logo />
 * </Flex>
 *
 * @example
 * // Space between with wrapping
 * <Flex justify="between" wrap="wrap" gap={4}>
 *   <Card>Card 1</Card>
 *   <Card>Card 2</Card>
 *   <Card>Card 3</Card>
 * </Flex>
 *
 * @example
 * // Column layout
 * <Flex direction="col" gap={2}>
 *   <Header />
 *   <Main />
 *   <Footer />
 * </Flex>
 */
const Flex = React.forwardRef<HTMLElement, FlexProps>(
  (
    {
      as: Component = "div",
      className,
      children,
      direction,
      wrap,
      align,
      justify,
      gap,
      gapX,
      gapY,
      inline,
      fullWidth,
      fullHeight,
      grow,
      shrink,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(
          flexVariants({
            direction,
            wrap,
            align,
            justify,
            gap,
            gapX,
            gapY,
            inline,
            fullWidth,
            fullHeight,
            grow,
            shrink,
          }),
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
Flex.displayName = "Flex"

/**
 * Props for FlexItem component.
 */
interface FlexItemProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /**
   * Child elements.
   */
  children?: React.ReactNode
  /**
   * HTML element or component to render as.
   * @default "div"
   */
  as?: React.ElementType
  /**
   * Flex grow value.
   */
  grow?: boolean | 0 | 1
  /**
   * Flex shrink value.
   */
  shrink?: boolean | 0 | 1
  /**
   * Flex basis value.
   */
  basis?: "auto" | "0" | "full" | "1/2" | "1/3" | "2/3" | "1/4" | "3/4"
  /**
   * Align self override.
   */
  alignSelf?: "auto" | "start" | "end" | "center" | "stretch" | "baseline"
  /**
   * Order in the flex container.
   */
  order?: "first" | "last" | "none" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
}

const basisMap = {
  auto: "basis-auto",
  "0": "basis-0",
  full: "basis-full",
  "1/2": "basis-1/2",
  "1/3": "basis-1/3",
  "2/3": "basis-2/3",
  "1/4": "basis-1/4",
  "3/4": "basis-3/4",
} as const

const alignSelfMap = {
  auto: "self-auto",
  start: "self-start",
  end: "self-end",
  center: "self-center",
  stretch: "self-stretch",
  baseline: "self-baseline",
} as const

const orderMap = {
  first: "order-first",
  last: "order-last",
  none: "order-none",
  1: "order-1",
  2: "order-2",
  3: "order-3",
  4: "order-4",
  5: "order-5",
  6: "order-6",
  7: "order-7",
  8: "order-8",
  9: "order-9",
  10: "order-10",
  11: "order-11",
  12: "order-12",
} as const

/**
 * A flex item component with common flex child utilities.
 *
 * @example
 * <Flex gap={4}>
 *   <FlexItem grow>Main content</FlexItem>
 *   <FlexItem shrink={false} basis="1/4">Sidebar</FlexItem>
 * </Flex>
 */
const FlexItem = React.forwardRef<HTMLElement, FlexItemProps>(
  (
    { as: Component = "div", className, children, grow, shrink, basis, alignSelf, order, ...props },
    ref
  ) => {
    const growClass =
      grow === true || grow === 1 ? "grow" : grow === false || grow === 0 ? "grow-0" : ""

    const shrinkClass =
      shrink === true || shrink === 1
        ? "shrink"
        : shrink === false || shrink === 0
          ? "shrink-0"
          : ""

    const basisClass = basis ? basisMap[basis] : ""
    const alignSelfClass = alignSelf ? alignSelfMap[alignSelf] : ""
    const orderClass = order !== undefined ? orderMap[order] : ""

    return (
      <Component
        ref={ref}
        className={cn(growClass, shrinkClass, basisClass, alignSelfClass, orderClass, className)}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
FlexItem.displayName = "FlexItem"

export type { FlexItemProps, FlexProps }
export { Flex, FlexItem, flexVariants }
