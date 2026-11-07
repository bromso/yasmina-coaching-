"use client"

import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const stackVariants = cva("flex", {
  variants: {
    /**
     * The direction of the stack.
     * - `vertical`: Stack items vertically (column)
     * - `horizontal`: Stack items horizontally (row)
     */
    direction: {
      vertical: "flex-col",
      horizontal: "flex-row",
      verticalReverse: "flex-col-reverse",
      horizontalReverse: "flex-row-reverse",
    },
    /**
     * Gap between stack items.
     */
    spacing: {
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
     * Alignment of items on the cross axis.
     */
    align: {
      start: "items-start",
      end: "items-end",
      center: "items-center",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    /**
     * Justification of items on the main axis.
     */
    justify: {
      start: "justify-start",
      end: "justify-end",
      center: "justify-center",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly",
    },
    /**
     * Whether items should wrap to the next line.
     */
    wrap: {
      true: "flex-wrap",
      false: "flex-nowrap",
      reverse: "flex-wrap-reverse",
    },
    /**
     * Whether the stack should take full width.
     */
    fullWidth: {
      true: "w-full",
      false: "",
    },
    /**
     * Whether the stack should take full height.
     */
    fullHeight: {
      true: "h-full",
      false: "",
    },
    /**
     * Whether to use inline-flex instead of flex.
     */
    inline: {
      true: "inline-flex",
      false: "",
    },
  },
  defaultVariants: {
    direction: "vertical",
    spacing: 4,
    align: "stretch",
    wrap: false,
    fullWidth: false,
    fullHeight: false,
    inline: false,
  },
  compoundVariants: [
    {
      inline: true,
      className: "inline-flex",
    },
  ],
})

/**
 * Props for the Stack component.
 */
interface StackProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children">,
    VariantProps<typeof stackVariants> {
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
   * Optional divider element to render between items.
   */
  divider?: React.ReactElement
}

/**
 * A stack component that arranges children in a vertical or horizontal line
 * with consistent spacing.
 *
 * @example
 * // Vertical stack (default)
 * <Stack spacing={4}>
 *   <Card>Item 1</Card>
 *   <Card>Item 2</Card>
 *   <Card>Item 3</Card>
 * </Stack>
 *
 * @example
 * // Horizontal stack
 * <Stack direction="horizontal" spacing={2} align="center">
 *   <Avatar />
 *   <span>Username</span>
 *   <Badge>Pro</Badge>
 * </Stack>
 *
 * @example
 * // With divider
 * <Stack divider={<Separator />} spacing={4}>
 *   <div>Section 1</div>
 *   <div>Section 2</div>
 *   <div>Section 3</div>
 * </Stack>
 *
 * @example
 * // Centered content
 * <Stack align="center" justify="center" fullHeight>
 *   <Logo />
 *   <h1>Welcome</h1>
 * </Stack>
 */
const Stack = React.forwardRef<HTMLElement, StackProps>(
  (
    {
      as: Component = "div",
      className,
      children,
      direction,
      spacing,
      align,
      justify,
      wrap,
      fullWidth,
      fullHeight,
      inline,
      divider,
      ...props
    },
    ref
  ) => {
    // If divider is provided, interleave it between children
    const childrenWithDivider = React.useMemo(() => {
      if (!divider) return children

      const childArray = React.Children.toArray(children).filter(Boolean)
      if (childArray.length <= 1) return children

      return childArray.reduce<React.ReactNode[]>((acc, child, index) => {
        acc.push(child)
        if (index < childArray.length - 1) {
          acc.push(
            React.cloneElement(divider, {
              // biome-ignore lint/suspicious/noArrayIndexKey: a divider is identified by the gap it fills, not by a child
              key: `divider-${index}`,
            })
          )
        }
        return acc
      }, [])
    }, [children, divider])

    return (
      <Component
        ref={ref}
        className={cn(
          stackVariants({
            direction,
            spacing,
            align,
            justify,
            wrap,
            fullWidth,
            fullHeight,
            inline,
          }),
          className
        )}
        {...props}
      >
        {childrenWithDivider}
      </Component>
    )
  }
)
Stack.displayName = "Stack"

/**
 * Convenience component for horizontal stacks.
 * Equivalent to <Stack direction="horizontal" />.
 */
const HStack = React.forwardRef<HTMLElement, Omit<StackProps, "direction">>((props, ref) => {
  return <Stack ref={ref} direction="horizontal" {...props} />
})
HStack.displayName = "HStack"

/**
 * Convenience component for vertical stacks.
 * Equivalent to <Stack direction="vertical" />.
 */
const VStack = React.forwardRef<HTMLElement, Omit<StackProps, "direction">>((props, ref) => {
  return <Stack ref={ref} direction="vertical" {...props} />
})
VStack.displayName = "VStack"

export type { StackProps }
export { HStack, Stack, stackVariants, VStack }
