import { toggleVariants } from "@repo/ui/components/animate-ui/components/base/toggle";
import { type ToggleGroupProps as ToggleGroupPrimitiveProps, type ToggleProps as TogglePrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/toggle-group";
import type { VariantProps } from "class-variance-authority";
type ToggleGroupProps = ToggleGroupPrimitiveProps & VariantProps<typeof toggleVariants>;
declare function ToggleGroup({ className, variant, size, children, multiple, ...props }: ToggleGroupProps): import("react").JSX.Element;
type ToggleProps = TogglePrimitiveProps & VariantProps<typeof toggleVariants>;
declare function Toggle({ className, children, variant, size, ...props }: ToggleProps): import("react").JSX.Element;
export { Toggle, ToggleGroup, type ToggleGroupProps, type ToggleProps };
