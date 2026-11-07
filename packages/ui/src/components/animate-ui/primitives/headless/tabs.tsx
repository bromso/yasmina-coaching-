"use client"

import {
  TabGroup as TabGroupPrimitive,
  type TabGroupProps as TabGroupPrimitiveProps,
  TabList as TabListPrimitive,
  type TabListProps as TabListPrimitiveProps,
  TabPanel as TabPanelPrimitive,
  type TabPanelProps as TabPanelPrimitiveProps,
  TabPanels as TabPanelsPrimitive,
  type TabPanelsProps as TabPanelsPrimitiveProps,
  Tab as TabPrimitive,
  type TabProps as TabPrimitiveProps,
} from "@headlessui/react"
import { getStrictContext } from "@repo/ui/lib/get-strict-context"
import type { HTMLMotionProps, motion, Transition } from "motion/react"
import * as React from "react"

type TabsContextType = {
  selectedIndex: number
}

const [TabsProvider, useTabsContext] = getStrictContext<TabsContextType>("TabsContext")

type TabGroupProps<TTag extends React.ElementType = "div"> = TabGroupPrimitiveProps<TTag>

function TabGroup<TTag extends React.ElementType = "div">(props: TabGroupProps<TTag>) {
  const { onChange, defaultIndex = 0, ...rest } = props as TabGroupPrimitiveProps<"div">
  const [selectedIndex, setSelectedIndex] = React.useState(defaultIndex)

  const handleChange = React.useCallback(
    (index: number) => {
      setSelectedIndex(index)
      onChange?.(index)
    },
    [onChange]
  )

  return (
    <TabsProvider value={{ selectedIndex }}>
      <TabGroupPrimitive
        data-slot="tab-group"
        defaultIndex={defaultIndex}
        onChange={handleChange}
        {...rest}
      />
    </TabsProvider>
  )
}

type TabListProps<TTag extends React.ElementType = "div"> = TabListPrimitiveProps<TTag>

function TabList<TTag extends React.ElementType = "div">(props: TabListProps<TTag>) {
  return <TabListPrimitive data-slot="tab-list" {...props} />
}

type TabProps<TTag extends React.ElementType = "button"> = TabPrimitiveProps<TTag> & {
  index?: number
}

function Tab<TTag extends React.ElementType = "button">(props: TabProps<TTag>) {
  const { index: _index, ...rest } = props
  return <TabPrimitive data-slot="tab" {...rest} />
}

type TabPanelsProps<TTag extends React.ElementType = typeof motion.div> =
  TabPanelsPrimitiveProps<TTag> &
    HTMLMotionProps<"div"> & {
      transition?: Transition
    }

function TabPanels<TTag extends React.ElementType = typeof motion.div>({
  transition = {
    type: "spring",
    stiffness: 300,
    damping: 30,
    bounce: 0,
  },
  ...props
}: TabPanelsProps<TTag>) {
  return <TabPanelsPrimitive data-slot="tab-panels" {...props} />
}

type TabPanelProps<TTag extends React.ElementType = typeof motion.div> =
  TabPanelPrimitiveProps<TTag> &
    HTMLMotionProps<"div"> & {
      index?: number
    }

function TabPanel<TTag extends React.ElementType = typeof motion.div>({
  index: _index,
  ...props
}: TabPanelProps<TTag>) {
  return <TabPanelPrimitive data-slot="tab-panel" {...props} />
}

type TabHighlightProps = React.ComponentProps<typeof motion.div> & {
  transition?: Transition
  children: React.ReactNode
}

function TabHighlight({
  children,
  transition = { type: "spring", stiffness: 200, damping: 25 },
  ...props
}: TabHighlightProps) {
  return (
    <div data-slot="tab-highlight" style={{ position: "relative" }} {...props}>
      {children}
    </div>
  )
}

type TabHighlightItemProps = React.ComponentProps<"div"> & {
  index: number
}

function TabHighlightItem({ index: _index, ...props }: TabHighlightItemProps) {
  return <div data-slot="tab-highlight-item" {...props} />
}

export {
  Tab,
  TabGroup,
  type TabGroupProps,
  TabHighlight,
  TabHighlightItem,
  type TabHighlightItemProps,
  type TabHighlightProps,
  TabList,
  type TabListProps,
  TabPanel,
  type TabPanelProps,
  TabPanels,
  type TabPanelsProps,
  type TabProps,
  type TabsContextType,
  useTabsContext,
}
