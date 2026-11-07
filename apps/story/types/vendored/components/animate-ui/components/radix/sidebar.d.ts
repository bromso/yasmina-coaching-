import { TooltipContent } from "@repo/ui/components/animate-ui/components/animate/tooltip";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Separator } from "@repo/ui/components/separator";
import { type VariantProps } from "class-variance-authority";
import type { Transition } from "motion/react";
import * as React from "react";
type SidebarContextProps = {
    state: "expanded" | "collapsed";
    open: boolean;
    setOpen: (open: boolean) => void;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    isMobile: boolean;
    toggleSidebar: () => void;
};
declare const useSidebar: () => SidebarContextProps;
type SidebarProviderProps = React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};
declare function SidebarProvider({ defaultOpen, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }: SidebarProviderProps): React.JSX.Element;
type SidebarProps = React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
    containerClassName?: string;
    animateOnHover?: boolean;
    transition?: Transition;
};
declare function Sidebar({ side, variant, collapsible, className, children, animateOnHover, containerClassName, transition, ...props }: SidebarProps): React.JSX.Element;
type SidebarTriggerProps = React.ComponentProps<typeof Button>;
declare function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps): React.JSX.Element;
type SidebarRailProps = React.ComponentProps<"button">;
declare function SidebarRail({ className, ...props }: SidebarRailProps): React.JSX.Element;
type SidebarInsetProps = React.ComponentProps<"main">;
declare function SidebarInset({ className, ...props }: SidebarInsetProps): React.JSX.Element;
type SidebarInputProps = React.ComponentProps<typeof Input>;
declare function SidebarInput({ className, ...props }: SidebarInputProps): React.JSX.Element;
type SidebarHeaderProps = React.ComponentProps<"div">;
declare function SidebarHeader({ className, ...props }: SidebarHeaderProps): React.JSX.Element;
type SidebarFooterProps = React.ComponentProps<"div">;
declare function SidebarFooter({ className, ...props }: SidebarFooterProps): React.JSX.Element;
type SidebarSeparatorProps = React.ComponentProps<typeof Separator>;
declare function SidebarSeparator({ className, ...props }: SidebarSeparatorProps): React.JSX.Element;
type SidebarContentProps = React.ComponentProps<"div">;
declare function SidebarContent({ className, ...props }: SidebarContentProps): React.JSX.Element;
type SidebarGroupProps = React.ComponentProps<"div">;
declare function SidebarGroup({ className, ...props }: SidebarGroupProps): React.JSX.Element;
type SidebarGroupLabelProps = React.ComponentProps<"div"> & {
    asChild?: boolean;
};
declare function SidebarGroupLabel({ className, asChild, ...props }: SidebarGroupLabelProps): React.JSX.Element;
type SidebarGroupActionProps = React.ComponentProps<"button"> & {
    asChild?: boolean;
};
declare function SidebarGroupAction({ className, asChild, ...props }: SidebarGroupActionProps): React.JSX.Element;
type SidebarGroupContentProps = React.ComponentProps<"div">;
declare function SidebarGroupContent({ className, ...props }: SidebarGroupContentProps): React.JSX.Element;
type SidebarMenuProps = React.ComponentProps<"ul">;
declare function SidebarMenu({ className, ...props }: SidebarMenuProps): React.JSX.Element;
type SidebarMenuItemProps = React.ComponentProps<"li">;
declare function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps): React.JSX.Element;
declare const sidebarMenuButtonVariants: (props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type SidebarMenuButtonProps = React.ComponentProps<"button"> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>;
declare function SidebarMenuButton({ asChild, isActive, variant, size, tooltip, className, ...props }: SidebarMenuButtonProps): React.JSX.Element;
type SidebarMenuActionProps = React.ComponentProps<"button"> & {
    asChild?: boolean;
    showOnHover?: boolean;
};
declare function SidebarMenuAction({ className, asChild, showOnHover, ...props }: SidebarMenuActionProps): React.JSX.Element;
type SidebarMenuBadgeProps = React.ComponentProps<"div">;
declare function SidebarMenuBadge({ className, ...props }: SidebarMenuBadgeProps): React.JSX.Element;
type SidebarMenuSkeletonProps = React.ComponentProps<"div"> & {
    showIcon?: boolean;
};
declare function SidebarMenuSkeleton({ className, showIcon, ...props }: SidebarMenuSkeletonProps): React.JSX.Element;
type SidebarMenuSubProps = React.ComponentProps<"ul">;
declare function SidebarMenuSub({ className, ...props }: SidebarMenuSubProps): React.JSX.Element;
type SidebarMenuSubItemProps = React.ComponentProps<"li">;
declare function SidebarMenuSubItem({ className, ...props }: SidebarMenuSubItemProps): React.JSX.Element;
type SidebarMenuSubButtonProps = React.ComponentProps<"a"> & {
    asChild?: boolean;
    size?: "sm" | "md";
    isActive?: boolean;
};
declare function SidebarMenuSubButton({ asChild, size, isActive, className, ...props }: SidebarMenuSubButtonProps): React.JSX.Element;
export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar, };
