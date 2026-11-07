import {
  TabGroup as TabGroupPrimitive,
  type TabGroupProps as TabGroupPrimitiveProps,
  TabHighlightItem as TabHighlightItemPrimitive,
  TabHighlight as TabHighlightPrimitive,
  TabList as TabListPrimitive,
  type TabListProps as TabListPrimitiveProps,
  TabPanel as TabPanelPrimitive,
  type TabPanelProps as TabPanelPrimitiveProps,
  TabPanels as TabPanelsPrimitive,
  type TabPanelsProps as TabPanelsPrimitiveProps,
  Tab as TabPrimitive,
  type TabProps as TabPrimitiveProps,
} from "@repo/ui/components/animate-ui/primitives/headless/tabs"
import { cn } from "@repo/ui/lib/utils"
import type { motion } from "motion/react"
import type * as React from "react"

type TabGroupProps<TTag extends React.ElementType = "div"> = TabGroupPrimitiveProps<TTag>

function TabGroup<TTag extends React.ElementType = "div">({
  className,
  ...props
}: TabGroupProps<TTag>) {
  return <TabGroupPrimitive className={cn("flex flex-col gap-2", className)} {...props} />
}

type TabListProps<TTag extends React.ElementType = "div"> = TabListPrimitiveProps<TTag>

function TabList<TTag extends React.ElementType = "div">({
  className,
  ...props
}: TabListProps<TTag>) {
  return (
    <TabHighlightPrimitive className="absolute z-0 inset-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm">
      <TabListPrimitive
        className={cn(
          "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
          className
        )}
        {...props}
      />
    </TabHighlightPrimitive>
  )
}

type TabProps<TTag extends React.ElementType = "button"> = TabPrimitiveProps<TTag>

function Tab<TTag extends React.ElementType = "button">({ className, ...props }: TabProps<TTag>) {
  return (
    <TabHighlightItemPrimitive index={props.index} className="flex-1">
      <TabPrimitive
        className={cn(
          "data-[active='true']:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-500 ease-in-out focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
        {...props}
      />
    </TabHighlightItemPrimitive>
  )
}

type TabPanelsProps<TTag extends React.ElementType = typeof motion.div> =
  TabPanelsPrimitiveProps<TTag>

function TabPanels<TTag extends React.ElementType = typeof motion.div>(
  props: TabPanelsProps<TTag>
) {
  return <TabPanelsPrimitive {...props} />
}

type TabPanelProps<TTag extends React.ElementType = typeof motion.div> =
  TabPanelPrimitiveProps<TTag>

function TabPanel<TTag extends React.ElementType = typeof motion.div>({
  className,
  ...props
}: TabPanelProps<TTag>) {
  return <TabPanelPrimitive className={cn("flex-1 outline-none", className)} {...props} />
}

export {
  Tab,
  TabGroup,
  type TabGroupProps,
  TabList,
  type TabListProps,
  TabPanel,
  type TabPanelProps,
  TabPanels,
  type TabPanelsProps,
  type TabProps,
}
