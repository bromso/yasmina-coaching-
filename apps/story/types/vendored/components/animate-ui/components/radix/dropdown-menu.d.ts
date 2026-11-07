import { type DropdownMenuCheckboxItemProps as DropdownMenuCheckboxItemPrimitiveProps, type DropdownMenuContentProps as DropdownMenuContentPrimitiveProps, type DropdownMenuGroupProps as DropdownMenuGroupPrimitiveProps, type DropdownMenuItemProps as DropdownMenuItemPrimitiveProps, type DropdownMenuLabelProps as DropdownMenuLabelPrimitiveProps, type DropdownMenuProps as DropdownMenuPrimitiveProps, type DropdownMenuRadioGroupProps as DropdownMenuRadioGroupPrimitiveProps, type DropdownMenuRadioItemProps as DropdownMenuRadioItemPrimitiveProps, type DropdownMenuSeparatorProps as DropdownMenuSeparatorPrimitiveProps, type DropdownMenuShortcutProps as DropdownMenuShortcutPrimitiveProps, type DropdownMenuSubContentProps as DropdownMenuSubContentPrimitiveProps, type DropdownMenuSubProps as DropdownMenuSubPrimitiveProps, type DropdownMenuSubTriggerProps as DropdownMenuSubTriggerPrimitiveProps, type DropdownMenuTriggerProps as DropdownMenuTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/dropdown-menu";
type DropdownMenuProps = DropdownMenuPrimitiveProps;
declare function DropdownMenu(props: DropdownMenuProps): import("react").JSX.Element;
type DropdownMenuTriggerProps = DropdownMenuTriggerPrimitiveProps;
declare function DropdownMenuTrigger(props: DropdownMenuTriggerProps): import("react").JSX.Element;
type DropdownMenuContentProps = DropdownMenuContentPrimitiveProps;
declare function DropdownMenuContent({ sideOffset, className, children, ...props }: DropdownMenuContentProps): import("react").JSX.Element;
type DropdownMenuGroupProps = DropdownMenuGroupPrimitiveProps;
declare function DropdownMenuGroup({ ...props }: DropdownMenuGroupProps): import("react").JSX.Element;
type DropdownMenuItemProps = DropdownMenuItemPrimitiveProps & {
    inset?: boolean;
    variant?: "default" | "destructive";
};
declare function DropdownMenuItem({ className, inset, variant, disabled, ...props }: DropdownMenuItemProps): import("react").JSX.Element;
type DropdownMenuCheckboxItemProps = DropdownMenuCheckboxItemPrimitiveProps;
declare function DropdownMenuCheckboxItem({ className, children, checked, disabled, ...props }: DropdownMenuCheckboxItemProps): import("react").JSX.Element;
type DropdownMenuRadioGroupProps = DropdownMenuRadioGroupPrimitiveProps;
declare function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps): import("react").JSX.Element;
type DropdownMenuRadioItemProps = DropdownMenuRadioItemPrimitiveProps;
declare function DropdownMenuRadioItem({ className, children, disabled, ...props }: DropdownMenuRadioItemProps): import("react").JSX.Element;
type DropdownMenuLabelProps = DropdownMenuLabelPrimitiveProps & {
    inset?: boolean;
};
declare function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps): import("react").JSX.Element;
type DropdownMenuSeparatorProps = DropdownMenuSeparatorPrimitiveProps;
declare function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps): import("react").JSX.Element;
type DropdownMenuShortcutProps = DropdownMenuShortcutPrimitiveProps;
declare function DropdownMenuShortcut({ className, ...props }: DropdownMenuShortcutProps): import("react").JSX.Element;
type DropdownMenuSubProps = DropdownMenuSubPrimitiveProps;
declare function DropdownMenuSub(props: DropdownMenuSubProps): import("react").JSX.Element;
type DropdownMenuSubTriggerProps = DropdownMenuSubTriggerPrimitiveProps & {
    inset?: boolean;
};
declare function DropdownMenuSubTrigger({ disabled, className, inset, children, ...props }: DropdownMenuSubTriggerProps): import("react").JSX.Element;
type DropdownMenuSubContentProps = DropdownMenuSubContentPrimitiveProps;
declare function DropdownMenuSubContent({ className, ...props }: DropdownMenuSubContentProps): import("react").JSX.Element;
export { DropdownMenu, DropdownMenuCheckboxItem, type DropdownMenuCheckboxItemProps, DropdownMenuContent, type DropdownMenuContentProps, DropdownMenuGroup, type DropdownMenuGroupProps, DropdownMenuItem, type DropdownMenuItemProps, DropdownMenuLabel, type DropdownMenuLabelProps, type DropdownMenuProps, DropdownMenuRadioGroup, type DropdownMenuRadioGroupProps, DropdownMenuRadioItem, type DropdownMenuRadioItemProps, DropdownMenuSeparator, type DropdownMenuSeparatorProps, DropdownMenuShortcut, type DropdownMenuShortcutProps, DropdownMenuSub, DropdownMenuSubContent, type DropdownMenuSubContentProps, type DropdownMenuSubProps, DropdownMenuSubTrigger, type DropdownMenuSubTriggerProps, DropdownMenuTrigger, type DropdownMenuTriggerProps, };
