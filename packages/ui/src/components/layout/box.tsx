"use client"

import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const boxVariants = cva("", {
  variants: {
    /**
     * Display type.
     */
    display: {
      block: "block",
      inlineBlock: "inline-block",
      inline: "inline",
      flex: "flex",
      inlineFlex: "inline-flex",
      grid: "grid",
      inlineGrid: "inline-grid",
      hidden: "hidden",
    },
    /**
     * Padding on all sides.
     */
    p: {
      0: "p-0",
      0.5: "p-0.5",
      1: "p-1",
      1.5: "p-1.5",
      2: "p-2",
      2.5: "p-2.5",
      3: "p-3",
      3.5: "p-3.5",
      4: "p-4",
      5: "p-5",
      6: "p-6",
      7: "p-7",
      8: "p-8",
      9: "p-9",
      10: "p-10",
      11: "p-11",
      12: "p-12",
      14: "p-14",
      16: "p-16",
      20: "p-20",
    },
    /**
     * Horizontal padding (left and right).
     */
    px: {
      0: "px-0",
      0.5: "px-0.5",
      1: "px-1",
      1.5: "px-1.5",
      2: "px-2",
      2.5: "px-2.5",
      3: "px-3",
      3.5: "px-3.5",
      4: "px-4",
      5: "px-5",
      6: "px-6",
      7: "px-7",
      8: "px-8",
      9: "px-9",
      10: "px-10",
      11: "px-11",
      12: "px-12",
      14: "px-14",
      16: "px-16",
      20: "px-20",
    },
    /**
     * Vertical padding (top and bottom).
     */
    py: {
      0: "py-0",
      0.5: "py-0.5",
      1: "py-1",
      1.5: "py-1.5",
      2: "py-2",
      2.5: "py-2.5",
      3: "py-3",
      3.5: "py-3.5",
      4: "py-4",
      5: "py-5",
      6: "py-6",
      7: "py-7",
      8: "py-8",
      9: "py-9",
      10: "py-10",
      11: "py-11",
      12: "py-12",
      14: "py-14",
      16: "py-16",
      20: "py-20",
    },
    /**
     * Padding on top.
     */
    pt: {
      0: "pt-0",
      1: "pt-1",
      2: "pt-2",
      3: "pt-3",
      4: "pt-4",
      5: "pt-5",
      6: "pt-6",
      8: "pt-8",
      10: "pt-10",
      12: "pt-12",
      16: "pt-16",
      20: "pt-20",
    },
    /**
     * Padding on right.
     */
    pr: {
      0: "pr-0",
      1: "pr-1",
      2: "pr-2",
      3: "pr-3",
      4: "pr-4",
      5: "pr-5",
      6: "pr-6",
      8: "pr-8",
      10: "pr-10",
      12: "pr-12",
      16: "pr-16",
      20: "pr-20",
    },
    /**
     * Padding on bottom.
     */
    pb: {
      0: "pb-0",
      1: "pb-1",
      2: "pb-2",
      3: "pb-3",
      4: "pb-4",
      5: "pb-5",
      6: "pb-6",
      8: "pb-8",
      10: "pb-10",
      12: "pb-12",
      16: "pb-16",
      20: "pb-20",
    },
    /**
     * Padding on left.
     */
    pl: {
      0: "pl-0",
      1: "pl-1",
      2: "pl-2",
      3: "pl-3",
      4: "pl-4",
      5: "pl-5",
      6: "pl-6",
      8: "pl-8",
      10: "pl-10",
      12: "pl-12",
      16: "pl-16",
      20: "pl-20",
    },
    /**
     * Margin on all sides.
     */
    m: {
      0: "m-0",
      0.5: "m-0.5",
      1: "m-1",
      1.5: "m-1.5",
      2: "m-2",
      2.5: "m-2.5",
      3: "m-3",
      3.5: "m-3.5",
      4: "m-4",
      5: "m-5",
      6: "m-6",
      7: "m-7",
      8: "m-8",
      auto: "m-auto",
    },
    /**
     * Horizontal margin (left and right).
     */
    mx: {
      0: "mx-0",
      1: "mx-1",
      2: "mx-2",
      3: "mx-3",
      4: "mx-4",
      5: "mx-5",
      6: "mx-6",
      8: "mx-8",
      auto: "mx-auto",
    },
    /**
     * Vertical margin (top and bottom).
     */
    my: {
      0: "my-0",
      1: "my-1",
      2: "my-2",
      3: "my-3",
      4: "my-4",
      5: "my-5",
      6: "my-6",
      8: "my-8",
      auto: "my-auto",
    },
    /**
     * Margin on top.
     */
    mt: {
      0: "mt-0",
      1: "mt-1",
      2: "mt-2",
      3: "mt-3",
      4: "mt-4",
      5: "mt-5",
      6: "mt-6",
      8: "mt-8",
      10: "mt-10",
      12: "mt-12",
      auto: "mt-auto",
    },
    /**
     * Margin on right.
     */
    mr: {
      0: "mr-0",
      1: "mr-1",
      2: "mr-2",
      3: "mr-3",
      4: "mr-4",
      5: "mr-5",
      6: "mr-6",
      8: "mr-8",
      auto: "mr-auto",
    },
    /**
     * Margin on bottom.
     */
    mb: {
      0: "mb-0",
      1: "mb-1",
      2: "mb-2",
      3: "mb-3",
      4: "mb-4",
      5: "mb-5",
      6: "mb-6",
      8: "mb-8",
      10: "mb-10",
      12: "mb-12",
      auto: "mb-auto",
    },
    /**
     * Margin on left.
     */
    ml: {
      0: "ml-0",
      1: "ml-1",
      2: "ml-2",
      3: "ml-3",
      4: "ml-4",
      5: "ml-5",
      6: "ml-6",
      8: "ml-8",
      auto: "ml-auto",
    },
    /**
     * Width.
     */
    w: {
      auto: "w-auto",
      full: "w-full",
      screen: "w-screen",
      min: "w-min",
      max: "w-max",
      fit: "w-fit",
    },
    /**
     * Height.
     */
    h: {
      auto: "h-auto",
      full: "h-full",
      screen: "h-screen",
      min: "h-min",
      max: "h-max",
      fit: "h-fit",
    },
    /**
     * Border radius.
     */
    rounded: {
      none: "rounded-none",
      sm: "rounded-sm",
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
      "3xl": "rounded-3xl",
      full: "rounded-full",
    },
    /**
     * Background color (semantic).
     */
    bg: {
      transparent: "bg-transparent",
      background: "bg-background",
      foreground: "bg-foreground",
      card: "bg-card",
      popover: "bg-popover",
      primary: "bg-primary",
      secondary: "bg-secondary",
      muted: "bg-muted",
      accent: "bg-accent",
      destructive: "bg-destructive",
    },
    /**
     * Text color (semantic).
     */
    color: {
      inherit: "text-inherit",
      foreground: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      secondary: "text-secondary-foreground",
      accent: "text-accent-foreground",
      destructive: "text-destructive",
    },
    /**
     * Border.
     */
    border: {
      none: "border-0",
      default: "border",
      2: "border-2",
      4: "border-4",
    },
    /**
     * Border color (semantic).
     */
    borderColor: {
      default: "border-border",
      input: "border-input",
      primary: "border-primary",
      destructive: "border-destructive",
      transparent: "border-transparent",
    },
    /**
     * Shadow.
     */
    shadow: {
      none: "shadow-none",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
      xl: "shadow-xl",
      "2xl": "shadow-2xl",
    },
    /**
     * Position type.
     */
    position: {
      static: "static",
      relative: "relative",
      absolute: "absolute",
      fixed: "fixed",
      sticky: "sticky",
    },
    /**
     * Overflow behavior.
     */
    overflow: {
      auto: "overflow-auto",
      hidden: "overflow-hidden",
      visible: "overflow-visible",
      scroll: "overflow-scroll",
      xAuto: "overflow-x-auto",
      yAuto: "overflow-y-auto",
      xHidden: "overflow-x-hidden",
      yHidden: "overflow-y-hidden",
    },
  },
  defaultVariants: {},
})

/**
 * Props for the Box component.
 */
interface BoxProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children" | "color">,
    VariantProps<typeof boxVariants> {
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
 * A generic box component that serves as a building block for layouts.
 * Provides easy access to common CSS properties through props.
 *
 * @example
 * // Basic box with padding
 * <Box p={4}>
 *   Content with padding
 * </Box>
 *
 * @example
 * // Card-like box
 * <Box p={6} rounded="lg" bg="card" border="default" shadow="md">
 *   <h3>Card Title</h3>
 *   <p>Card content</p>
 * </Box>
 *
 * @example
 * // Centered content box
 * <Box display="flex" p={4} mx="auto" w="full" style={{ maxWidth: 800 }}>
 *   <Content />
 * </Box>
 *
 * @example
 * // As a different element
 * <Box as="section" py={12} bg="muted">
 *   <Container>
 *     <SectionContent />
 *   </Container>
 * </Box>
 */
const Box = React.forwardRef<HTMLElement, BoxProps>(
  (
    {
      as: Component = "div",
      className,
      children,
      display,
      p,
      px,
      py,
      pt,
      pr,
      pb,
      pl,
      m,
      mx,
      my,
      mt,
      mr,
      mb,
      ml,
      w,
      h,
      rounded,
      bg,
      color,
      border,
      borderColor,
      shadow,
      position,
      overflow,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(
          boxVariants({
            display,
            p,
            px,
            py,
            pt,
            pr,
            pb,
            pl,
            m,
            mx,
            my,
            mt,
            mr,
            mb,
            ml,
            w,
            h,
            rounded,
            bg,
            color,
            border,
            borderColor,
            shadow,
            position,
            overflow,
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
Box.displayName = "Box"

export type { BoxProps }
export { Box, boxVariants }
