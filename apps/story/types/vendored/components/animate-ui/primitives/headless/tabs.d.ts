import { type TabGroupProps as TabGroupPrimitiveProps, type TabListProps as TabListPrimitiveProps, type TabPanelProps as TabPanelPrimitiveProps, type TabPanelsProps as TabPanelsPrimitiveProps, type TabProps as TabPrimitiveProps } from "@headlessui/react";
import type { HTMLMotionProps, motion, Transition } from "motion/react";
import * as React from "react";
type TabsContextType = {
    selectedIndex: number;
};
declare const useTabsContext: () => TabsContextType;
type TabGroupProps<TTag extends React.ElementType = "div"> = TabGroupPrimitiveProps<TTag>;
declare function TabGroup<TTag extends React.ElementType = "div">(props: TabGroupProps<TTag>): React.JSX.Element;
type TabListProps<TTag extends React.ElementType = "div"> = TabListPrimitiveProps<TTag>;
declare function TabList<TTag extends React.ElementType = "div">(props: TabListProps<TTag>): React.JSX.Element;
type TabProps<TTag extends React.ElementType = "button"> = TabPrimitiveProps<TTag> & {
    index?: number;
};
declare function Tab<TTag extends React.ElementType = "button">(props: TabProps<TTag>): React.JSX.Element;
type TabPanelsProps<TTag extends React.ElementType = typeof motion.div> = TabPanelsPrimitiveProps<TTag> & HTMLMotionProps<"div"> & {
    transition?: Transition;
};
declare function TabPanels<TTag extends React.ElementType = typeof motion.div>({ transition, ...props }: TabPanelsProps<TTag>): React.JSX.Element;
type TabPanelProps<TTag extends React.ElementType = typeof motion.div> = TabPanelPrimitiveProps<TTag> & HTMLMotionProps<"div"> & {
    index?: number;
};
declare function TabPanel<TTag extends React.ElementType = typeof motion.div>({ index: _index, ...props }: TabPanelProps<TTag>): React.JSX.Element;
type TabHighlightProps = React.ComponentProps<typeof motion.div> & {
    transition?: Transition;
    children: React.ReactNode;
};
declare function TabHighlight({ children, transition, ...props }: TabHighlightProps): React.JSX.Element;
type TabHighlightItemProps = React.ComponentProps<"div"> & {
    index: number;
};
declare function TabHighlightItem({ index: _index, ...props }: TabHighlightItemProps): React.JSX.Element;
export { Tab, TabGroup, type TabGroupProps, TabHighlight, TabHighlightItem, type TabHighlightItemProps, type TabHighlightProps, TabList, type TabListProps, TabPanel, type TabPanelProps, TabPanels, type TabPanelsProps, type TabProps, type TabsContextType, useTabsContext, };
