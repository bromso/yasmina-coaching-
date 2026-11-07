"use client"

import { cn } from "@repo/ui/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { createContext, useCallback, useContext, useRef, useState } from "react"

interface TabsContextValue {
  activeTab: string
  prevTab: React.MutableRefObject<string>
  setActiveTab: (value: string) => void
  layoutId: string
  registerTab: (value: string) => void
  getDirection: () => number
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error("Tabs components must be used within an AnimatedTabs")
  }
  return context
}

interface AnimatedTabsProps {
  defaultValue: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
  /** External direction override (1 for forward, -1 for backward) */
  direction?: number
}

function AnimatedTabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
  direction: externalDirection,
}: AnimatedTabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const activeTab = value ?? internalValue
  const prevTab = useRef(activeTab)
  const tabOrder = useRef<string[]>([])
  const layoutId = `tabs-indicator-${defaultValue}`

  const registerTab = useCallback((tabValue: string) => {
    if (!tabOrder.current.includes(tabValue)) {
      tabOrder.current.push(tabValue)
    }
  }, [])

  const getDirection = useCallback(() => {
    // Use external direction if provided
    if (externalDirection !== undefined) {
      return externalDirection
    }
    const currentIndex = tabOrder.current.indexOf(activeTab)
    const prevIndex = tabOrder.current.indexOf(prevTab.current)
    return currentIndex >= prevIndex ? 1 : -1
  }, [activeTab, externalDirection])

  const setActiveTab = (newValue: string) => {
    prevTab.current = activeTab
    if (!value) {
      setInternalValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <TabsContext.Provider
      value={{ activeTab, prevTab, setActiveTab, layoutId, registerTab, getDirection }}
    >
      <div data-slot="animated-tabs" className={cn("flex flex-col gap-2", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

interface AnimatedTabsListProps {
  children: React.ReactNode
  className?: string
}

function AnimatedTabsList({ children, className }: AnimatedTabsListProps) {
  return (
    <div
      data-slot="animated-tabs-list"
      className={cn(
        "bg-muted text-muted-foreground relative inline-flex h-9 w-full items-center justify-start rounded-lg p-1",
        className
      )}
    >
      {children}
    </div>
  )
}

interface AnimatedTabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

function AnimatedTabsTrigger({
  value,
  children,
  className,
  disabled = false,
}: AnimatedTabsTriggerProps) {
  const { activeTab, setActiveTab, layoutId, registerTab } = useTabsContext()
  const isActive = activeTab === value

  // Register tab on mount
  registerTab(value)

  return (
    <button
      type="button"
      data-slot="animated-tabs-trigger"
      data-state={isActive ? "active" : "inactive"}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        "relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
        className
      )}
    >
      {isActive && (
        <motion.div
          layoutId={layoutId}
          className="bg-background absolute inset-0 rounded-md shadow-sm"
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 35,
          }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

interface AnimatedTabsContentsProps {
  children: React.ReactNode
  className?: string
}

function AnimatedTabsContents({ children, className }: AnimatedTabsContentsProps) {
  const { activeTab } = useTabsContext()

  return (
    <div data-slot="animated-tabs-contents" className={cn("relative overflow-hidden", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {React.Children.map(children, (child) => {
          if (!React.isValidElement<{ value: string }>(child)) return null
          if (child.props.value === activeTab) {
            return child
          }
          return null
        })}
      </AnimatePresence>
    </div>
  )
}

interface AnimatedTabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

function AnimatedTabsContent({ value, children, className }: AnimatedTabsContentProps) {
  const { activeTab, getDirection } = useTabsContext()
  const isActive = activeTab === value

  if (!isActive) return null

  const direction = getDirection()

  return (
    <motion.div
      key={value}
      data-slot="animated-tabs-content"
      initial={{ opacity: 0, x: direction * 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: direction * -50 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn("flex-1 outline-none", className)}
    >
      {children}
    </motion.div>
  )
}

export {
  AnimatedTabs,
  AnimatedTabsContent,
  AnimatedTabsContents,
  AnimatedTabsList,
  AnimatedTabsTrigger,
}
