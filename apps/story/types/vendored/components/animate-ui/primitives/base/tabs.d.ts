import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { type AutoHeightProps } from "@repo/ui/components/animate-ui/primitives/effects/auto-height";
import { type HighlightItemProps, type HighlightProps } from "@repo/ui/components/animate-ui/primitives/effects/highlight";
import { type HTMLMotionProps, type Transition } from "motion/react";
import * as React from "react";
type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root>;
declare function Tabs(props: TabsProps): React.JSX.Element;
type TabsHighlightProps = Omit<HighlightProps, "controlledItems" | "value">;
declare function TabsHighlight({ transition, ...props }: TabsHighlightProps): React.JSX.Element;
type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List>;
declare function TabsList(props: TabsListProps): React.JSX.Element;
type TabsHighlightItemProps = HighlightItemProps & {
    value: string;
};
declare function TabsHighlightItem(props: TabsHighlightItemProps): React.JSX.Element;
type TabsTabProps = React.ComponentProps<typeof TabsPrimitive.Tab>;
declare function TabsTab(props: TabsTabProps): React.JSX.Element;
type TabsPanelProps = React.ComponentProps<typeof TabsPrimitive.Panel> & HTMLMotionProps<"div">;
declare function TabsPanel({ value, keepMounted, transition, ...props }: TabsPanelProps): React.JSX.Element;
type TabsPanelsAutoProps = Omit<AutoHeightProps, "children"> & {
    mode?: "auto-height";
    children: React.ReactNode;
    transition?: Transition;
};
type TabsPanelsLayoutProps = Omit<HTMLMotionProps<"div">, "children"> & {
    mode: "layout";
    children: React.ReactNode;
    transition?: Transition;
};
type TabsPanelsProps = TabsPanelsAutoProps | TabsPanelsLayoutProps;
declare function TabsPanels(props: TabsPanelsProps): React.JSX.Element;
export { Tabs, TabsHighlight, TabsHighlightItem, type TabsHighlightItemProps, type TabsHighlightProps, TabsList, type TabsListProps, TabsPanel, type TabsPanelProps, TabsPanels, type TabsPanelsProps, type TabsProps, TabsTab, type TabsTabProps, };
