"use client"

import { buttonVariants } from "@repo/ui/components/animate-ui/components/buttons/button"
import {
  RippleButton as RippleButtonPrimitive,
  type RippleButtonProps as RippleButtonPrimitiveProps,
  RippleButtonRipples as RippleButtonRipplesPrimitive,
  type RippleButtonRipplesProps as RippleButtonRipplesPrimitiveProps,
} from "@repo/ui/components/animate-ui/primitives/buttons/ripple"
import { cn } from "@repo/ui/lib/utils"
import type { VariantProps } from "class-variance-authority"

const rippleButtonVariants = {
  default: "[--ripple-button-ripple-color:var(--primary-foreground)]",
  accent: "[--ripple-button-ripple-color:var(--accent-foreground)]",
  destructive: "[--ripple-button-ripple-color:var(--destructive-foreground)]",
  outline: "[--ripple-button-ripple-color:var(--foreground)]",
  secondary: "[--ripple-button-ripple-color:var(--secondary-foreground)]",
  ghost: "[--ripple-button-ripple-color:var(--foreground)]",
  link: "[--ripple-button-ripple-color:var(--primary-foreground)]",
}

type RippleButtonProps = RippleButtonPrimitiveProps & VariantProps<typeof buttonVariants>

function RippleButton({ className, variant, size, ...props }: RippleButtonProps) {
  return (
    <RippleButtonPrimitive
      className={cn(
        buttonVariants({ variant, size, className }),
        rippleButtonVariants[variant as keyof typeof rippleButtonVariants]
      )}
      {...props}
    />
  )
}

type RippleButtonRipplesProps = RippleButtonRipplesPrimitiveProps

function RippleButtonRipples(props: RippleButtonRipplesProps) {
  return <RippleButtonRipplesPrimitive {...props} />
}

export { RippleButton, type RippleButtonProps, RippleButtonRipples, type RippleButtonRipplesProps }
