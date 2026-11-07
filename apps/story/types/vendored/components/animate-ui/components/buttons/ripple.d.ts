import { buttonVariants } from "@repo/ui/components/animate-ui/components/buttons/button";
import { type RippleButtonProps as RippleButtonPrimitiveProps, type RippleButtonRipplesProps as RippleButtonRipplesPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/buttons/ripple";
import type { VariantProps } from "class-variance-authority";
type RippleButtonProps = RippleButtonPrimitiveProps & VariantProps<typeof buttonVariants>;
declare function RippleButton({ className, variant, size, ...props }: RippleButtonProps): import("react").JSX.Element;
type RippleButtonRipplesProps = RippleButtonRipplesPrimitiveProps;
declare function RippleButtonRipples(props: RippleButtonRipplesProps): import("react").JSX.Element;
export { RippleButton, type RippleButtonProps, RippleButtonRipples, type RippleButtonRipplesProps };
