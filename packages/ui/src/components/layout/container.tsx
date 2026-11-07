"use client"

import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const containerVariants = cva("mx-auto w-full px-4 sm:px-6 lg:px-8", {
  variants: {
    /**
     * Maximum width constraint for the container.
     * - `xs`: 320px max-width
     * - `sm`: 640px max-width
     * - `md`: 768px max-width
     * - `lg`: 1024px max-width
     * - `xl`: 1280px max-width
     * - `2xl`: 1536px max-width
     * - `full`: No max-width constraint
     * - `prose`: Optimal reading width (~65ch)
     */
    maxWidth: {
      xs: "max-w-xs",
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
      "3xl": "max-w-3xl",
      "4xl": "max-w-4xl",
      "5xl": "max-w-5xl",
      "6xl": "max-w-6xl",
      "7xl": "max-w-7xl",
      full: "max-w-full",
      prose: "max-w-prose",
      screen: "max-w-screen-2xl",
    },
    /**
     * Whether to center the container content.
     */
    centered: {
      true: "text-center",
      false: "",
    },
    /**
     * Padding on the x-axis.
     */
    paddingX: {
      none: "px-0",
      sm: "px-2 sm:px-4",
      md: "px-4 sm:px-6 lg:px-8",
      lg: "px-6 sm:px-8 lg:px-12",
      xl: "px-8 sm:px-12 lg:px-16",
    },
    /**
     * Padding on the y-axis.
     */
    paddingY: {
      none: "py-0",
      sm: "py-2 sm:py-4",
      md: "py-4 sm:py-6 lg:py-8",
      lg: "py-6 sm:py-8 lg:py-12",
      xl: "py-8 sm:py-12 lg:py-16",
    },
  },
  defaultVariants: {
    maxWidth: "7xl",
    centered: false,
  },
})

/**
 * Props for the Container component.
 */
interface ContainerProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children">,
    VariantProps<typeof containerVariants> {
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
 * A responsive container component that constrains content width
 * and provides consistent horizontal padding.
 *
 * @example
 * // Default container with 7xl max-width
 * <Container>
 *   <h1>Page content</h1>
 * </Container>
 *
 * @example
 * // Narrow container for reading content
 * <Container maxWidth="prose">
 *   <article>Long form content...</article>
 * </Container>
 *
 * @example
 * // Full-width container with custom padding
 * <Container maxWidth="full" paddingX="lg" paddingY="xl">
 *   <HeroSection />
 * </Container>
 *
 * @example
 * // As a semantic element
 * <Container as="main" maxWidth="6xl">
 *   <PageContent />
 * </Container>
 */
const Container = React.forwardRef<HTMLElement, ContainerProps>(
  (
    {
      as: Component = "div",
      className,
      children,
      maxWidth,
      centered,
      paddingX,
      paddingY,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(
          containerVariants({
            maxWidth,
            centered,
            paddingX,
            paddingY,
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
Container.displayName = "Container"

export type { ContainerProps }
export { Container, containerVariants }
