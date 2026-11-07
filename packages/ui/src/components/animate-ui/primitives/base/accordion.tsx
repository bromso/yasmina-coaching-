"use client"

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { useControlledState } from "@repo/ui/hooks/use-controlled-state"
import { getStrictContext } from "@repo/ui/lib/get-strict-context"
import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react"
import * as React from "react"

// @base-ui/react 1.x: an accordion's value is always an array (`multiple` limits it to one item).
type AccordionValue = AccordionPrimitive.Root.Value<string>
type AccordionChangeDetails = AccordionPrimitive.Root.ChangeEventDetails

type AccordionContextType = {
  value: AccordionValue | undefined
  setValue: (value: AccordionValue, eventDetails: AccordionChangeDetails) => void
}

type AccordionItemContextType = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const [AccordionProvider, useAccordion] = getStrictContext<AccordionContextType>("AccordionContext")

const [AccordionItemProvider, useAccordionItem] =
  getStrictContext<AccordionItemContextType>("AccordionItemContext")

type AccordionProps = AccordionPrimitive.Root.Props<string>

function Accordion(props: AccordionProps) {
  const [value, setLocalValue] = useControlledState<AccordionValue>({
    value: props?.value,
    defaultValue: props?.defaultValue,
  })
  // The caller sees the change first and may cancel it (`eventDetails.cancel()`), in which case
  // Base UI keeps the item closed — so the local open state must not move either. When controlled,
  // only the caller's `value` moves it (a parent that ignores the change keeps the item closed).
  const controlled = props?.value !== undefined
  const setValue = React.useCallback(
    (next: AccordionValue, eventDetails: AccordionChangeDetails) => {
      props?.onValueChange?.(next, eventDetails)
      if (!eventDetails.isCanceled && !controlled) setLocalValue(next)
    },
    [props?.onValueChange, setLocalValue, controlled]
  )

  return (
    <AccordionProvider value={{ value, setValue }}>
      <AccordionPrimitive.Root data-slot="accordion" {...props} onValueChange={setValue} />
    </AccordionProvider>
  )
}

// Required here (optional in Base UI, which then generates one): the open state is matched by it.
type AccordionItemProps = Omit<React.ComponentProps<typeof AccordionPrimitive.Item>, "value"> & {
  value: string
}

function AccordionItem(props: AccordionItemProps) {
  const { value } = useAccordion()
  const [isOpen, setIsOpen] = React.useState(value?.includes(props?.value) ?? false)

  React.useEffect(() => {
    setIsOpen(value?.includes(props?.value) ?? false)
  }, [value, props?.value])

  return (
    <AccordionItemProvider value={{ isOpen, setIsOpen }}>
      <AccordionPrimitive.Item data-slot="accordion-item" {...props} />
    </AccordionItemProvider>
  )
}

type AccordionHeaderProps = React.ComponentProps<typeof AccordionPrimitive.Header>

function AccordionHeader(props: AccordionHeaderProps) {
  return <AccordionPrimitive.Header data-slot="accordion-header" {...props} />
}

type AccordionTriggerProps = React.ComponentProps<typeof AccordionPrimitive.Trigger>

function AccordionTrigger(props: AccordionTriggerProps) {
  return <AccordionPrimitive.Trigger data-slot="accordion-trigger" {...props} />
}

type AccordionPanelProps = Omit<
  React.ComponentProps<typeof AccordionPrimitive.Panel>,
  "keepMounted" | "render"
> &
  HTMLMotionProps<"div"> & {
    keepRendered?: boolean
  }

function AccordionPanel({
  transition = { duration: 0.35, ease: "easeInOut" },
  hiddenUntilFound,
  keepRendered = false,
  ...props
}: AccordionPanelProps) {
  const { isOpen } = useAccordionItem()

  return (
    <AnimatePresence>
      {keepRendered ? (
        <AccordionPrimitive.Panel
          hidden={false}
          hiddenUntilFound={hiddenUntilFound}
          keepMounted
          render={
            <motion.div
              key="accordion-panel"
              data-slot="accordion-panel"
              initial={{ height: 0, opacity: 0, "--mask-stop": "0%", y: 20 }}
              animate={
                isOpen
                  ? { height: "auto", opacity: 1, "--mask-stop": "100%", y: 0 }
                  : { height: 0, opacity: 0, "--mask-stop": "0%", y: 20 }
              }
              transition={transition}
              style={{
                maskImage: "linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
                WebkitMaskImage:
                  "linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
                overflow: "hidden",
              }}
              {...props}
            />
          }
        />
      ) : (
        isOpen && (
          <AccordionPrimitive.Panel
            hidden={false}
            hiddenUntilFound={hiddenUntilFound}
            keepMounted
            render={
              <motion.div
                key="accordion-panel"
                data-slot="accordion-panel"
                initial={{ height: 0, opacity: 0, "--mask-stop": "0%", y: 20 }}
                animate={{
                  height: "auto",
                  opacity: 1,
                  "--mask-stop": "100%",
                  y: 0,
                }}
                exit={{ height: 0, opacity: 0, "--mask-stop": "0%", y: 20 }}
                transition={transition}
                style={{
                  maskImage:
                    "linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
                  WebkitMaskImage:
                    "linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
                  overflow: "hidden",
                }}
                {...props}
              />
            }
          />
        )
      )}
    </AnimatePresence>
  )
}

export {
  Accordion,
  AccordionHeader,
  type AccordionHeaderProps,
  AccordionItem,
  type AccordionItemContextType,
  type AccordionItemProps,
  AccordionPanel,
  type AccordionPanelProps,
  type AccordionProps,
  AccordionTrigger,
  type AccordionTriggerProps,
  useAccordionItem,
}
