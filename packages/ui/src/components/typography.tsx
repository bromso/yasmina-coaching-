import { Slot } from "@radix-ui/react-slot"
import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

/* -----------------------------------------------------------------------------
 * Typography Variants (cva)
 * -------------------------------------------------------------------------- */

const typographyVariants = cva("antialiased", {
  variants: {
    variant: {
      h1: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
      h2: "scroll-m-20 text-3xl font-semibold tracking-tight first:mt-0",
      h3: "scroll-m-20 text-2xl font-semibold tracking-tight",
      h4: "scroll-m-20 text-xl font-semibold tracking-tight",
      p: "leading-7 [&:not(:first-child)]:mt-6",
      lead: "text-xl text-muted-foreground",
      large: "text-lg font-semibold",
      small: "text-sm font-medium leading-none",
      muted: "text-sm text-muted-foreground",
      blockquote: "mt-6 border-l-2 pl-6 italic",
      code: "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
      list: "my-6 ml-6 [&>li]:mt-2",
    },
    tone: {
      default: "",
      muted: "text-muted-foreground",
      primary: "text-primary",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive",
      success: "text-emerald-600 dark:text-emerald-500",
      warning: "text-amber-600 dark:text-amber-500",
    },
    size: {
      inherit: "",
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl",
      "2xl": "text-2xl",
      "3xl": "text-3xl",
      "4xl": "text-4xl",
    },
    weight: {
      inherit: "",
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
      extrabold: "font-extrabold",
    },
    align: {
      inherit: "",
      left: "text-left",
      center: "text-center",
      right: "text-right",
      justify: "text-justify",
    },
    wrap: {
      inherit: "",
      wrap: "text-wrap",
      nowrap: "text-nowrap",
      balance: "text-balance",
      pretty: "text-pretty",
    },
  },
  defaultVariants: {
    variant: "p",
    tone: "default",
    size: "inherit",
    weight: "inherit",
    align: "inherit",
    wrap: "inherit",
  },
})

/* -----------------------------------------------------------------------------
 * Typography Component Types
 * -------------------------------------------------------------------------- */

type TypographyVariant = NonNullable<VariantProps<typeof typographyVariants>["variant"]>

type TypographyProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof typographyVariants> & {
    as?: React.ElementType
    asChild?: boolean
  }

/* -----------------------------------------------------------------------------
 * Typography Component
 * -------------------------------------------------------------------------- */

function Typography({
  as,
  asChild = false,
  variant = "p",
  tone,
  size,
  weight,
  align,
  wrap,
  className,
  ...props
}: TypographyProps) {
  const elementMap: Record<TypographyVariant, React.ElementType> = {
    h1: "h1",
    h2: "h2",
    h3: "h3",
    h4: "h4",
    p: "p",
    lead: "p",
    large: "p",
    small: "small",
    muted: "p",
    blockquote: "blockquote",
    code: "code",
    list: "ul",
  }

  const Component = asChild ? Slot : (as ?? elementMap[variant ?? "p"])

  return (
    <Component
      data-slot="typography"
      className={cn(typographyVariants({ variant, tone, size, weight, align, wrap, className }))}
      {...props}
    />
  )
}

/* -----------------------------------------------------------------------------
 * Heading Components
 * -------------------------------------------------------------------------- */

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement> &
  Omit<VariantProps<typeof typographyVariants>, "variant"> & {
    asChild?: boolean
  }

function H1({ className, ...props }: HeadingProps) {
  return <Typography as="h1" variant="h1" className={className} {...props} />
}

function H2({ className, ...props }: HeadingProps) {
  return <Typography as="h2" variant="h2" className={className} {...props} />
}

function H3({ className, ...props }: HeadingProps) {
  return <Typography as="h3" variant="h3" className={className} {...props} />
}

function H4({ className, ...props }: HeadingProps) {
  return <Typography as="h4" variant="h4" className={className} {...props} />
}

/* -----------------------------------------------------------------------------
 * Paragraph Components
 * -------------------------------------------------------------------------- */

type ParagraphProps = React.HTMLAttributes<HTMLParagraphElement> &
  Omit<VariantProps<typeof typographyVariants>, "variant"> & {
    asChild?: boolean
  }

function Paragraph({ className, ...props }: ParagraphProps) {
  return <Typography as="p" variant="p" className={className} {...props} />
}

function Lead({ className, ...props }: ParagraphProps) {
  return <Typography as="p" variant="lead" className={className} {...props} />
}

function Large({ className, ...props }: ParagraphProps) {
  return <Typography as="p" variant="large" className={className} {...props} />
}

function Muted({ className, ...props }: ParagraphProps) {
  return <Typography as="p" variant="muted" className={className} {...props} />
}

/* -----------------------------------------------------------------------------
 * Inline & Block Components
 * -------------------------------------------------------------------------- */

type SmallProps = React.HTMLAttributes<HTMLElement> &
  Omit<VariantProps<typeof typographyVariants>, "variant"> & {
    asChild?: boolean
  }

function Small({ className, ...props }: SmallProps) {
  return <Typography as="small" variant="small" className={className} {...props} />
}

type BlockquoteProps = React.BlockquoteHTMLAttributes<HTMLQuoteElement> &
  Omit<VariantProps<typeof typographyVariants>, "variant"> & {
    asChild?: boolean
  }

function Blockquote({ className, ...props }: BlockquoteProps) {
  return <Typography as="blockquote" variant="blockquote" className={className} {...props} />
}

type CodeProps = React.HTMLAttributes<HTMLElement> &
  Omit<VariantProps<typeof typographyVariants>, "variant"> & {
    asChild?: boolean
  }

function InlineCode({ className, ...props }: CodeProps) {
  return <Typography as="code" variant="code" className={className} {...props} />
}

/* -----------------------------------------------------------------------------
 * List Components
 * -------------------------------------------------------------------------- */

type ListProps = React.HTMLAttributes<HTMLUListElement | HTMLOListElement> &
  Omit<VariantProps<typeof typographyVariants>, "variant"> & {
    ordered?: boolean
    asChild?: boolean
  }

function List({ ordered = false, className, ...props }: ListProps) {
  return (
    <Typography
      as={ordered ? "ol" : "ul"}
      variant="list"
      className={cn(ordered ? "list-decimal" : "list-disc", className)}
      {...props}
    />
  )
}

type ListItemProps = React.LiHTMLAttributes<HTMLLIElement>

function ListItem({ className, ...props }: ListItemProps) {
  return <li className={cn(className)} {...props} />
}

/* -----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */

export type {
  BlockquoteProps,
  CodeProps,
  HeadingProps,
  ListItemProps,
  ListProps,
  ParagraphProps,
  SmallProps,
  TypographyProps,
}
export {
  Blockquote,
  H1,
  H2,
  H3,
  H4,
  InlineCode,
  Large,
  Lead,
  List,
  ListItem,
  Muted,
  Paragraph,
  Small,
  Typography,
  typographyVariants,
}
