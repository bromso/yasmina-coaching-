import { toggleVariants } from "@repo/ui/components/animate-ui/components/radix/toggle";
import { type ToggleGroupItemProps as ToggleGroupItemPrimitiveProps, type ToggleGroupProps as ToggleGroupPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/toggle-group";
import type { VariantProps } from "class-variance-authority";
type ToggleGroupProps = ToggleGroupPrimitiveProps & VariantProps<typeof toggleVariants>;
declare function ToggleGroup({ className, variant, size, children, ...props }: ToggleGroupProps): import("react").JSX.Element;
type ToggleGroupItemProps = ToggleGroupItemPrimitiveProps & VariantProps<typeof toggleVariants>;
declare function ToggleGroupItem({ className, children, variant, size, ...props }: ToggleGroupItemProps): import("react").JSX.Element;
export { ToggleGroup, ToggleGroupItem, type ToggleGroupItemProps, type ToggleGroupProps };
