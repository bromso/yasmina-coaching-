"use client"

import {
  Accordion,
  AccordionHeader,
  type AccordionHeaderProps,
  AccordionItem,
  type AccordionItemProps,
  AccordionPanel,
  type AccordionPanelProps,
  type AccordionProps,
  AccordionTrigger,
  type AccordionTriggerProps,
} from "@repo/ui/components/animate-ui/primitives/base/accordion"
import {
  Highlight,
  HighlightItem,
  type HighlightItemProps,
  type HighlightProps,
} from "@repo/ui/components/animate-ui/primitives/effects/highlight"
import { useControlledState } from "@repo/ui/hooks/use-controlled-state"
import { getStrictContext } from "@repo/ui/lib/get-strict-context"
import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react"
import * as React from "react"

type FilesContextType = {
  open: string[]
}

type FolderContextType = {
  isOpen: boolean
}

const [FilesProvider, useFiles] = getStrictContext<FilesContextType>("FilesContext")

const [FolderProvider, useFolder] = getStrictContext<FolderContextType>("FolderContext")

type FilesProps = {
  children: React.ReactNode
  defaultOpen?: string[]
  open?: string[]
  onOpenChange?: (open: string[]) => void
} & Omit<AccordionProps, "type" | "defaultValue" | "value" | "onValueChange">

function Files({ children, defaultOpen, open, onOpenChange, style, ...props }: FilesProps) {
  const [openValue, setLocalOpen] = useControlledState({ value: open, defaultValue: defaultOpen })
  // As in Accordion: the caller hears first, and a controlled `open` alone moves the folders, so a
  // parent that ignores the change does not leave a folder icon open over a closed panel.
  const setOpenValue = React.useCallback(
    (next: string[]) => {
      onOpenChange?.(next)
      if (open === undefined) setLocalOpen(next)
    },
    [onOpenChange, open, setLocalOpen]
  )

  return (
    <FilesProvider value={{ open: openValue ?? [] }}>
      <Accordion
        data-slot="files"
        multiple
        defaultValue={defaultOpen}
        value={open}
        onValueChange={setOpenValue}
        style={{
          position: "relative",
          overflow: "auto",
          ...style,
        }}
        {...props}
      >
        {children}
      </Accordion>
    </FilesProvider>
  )
}

type FilesHighlightProps = Omit<HighlightProps, "controlledItems" | "mode">

function FilesHighlight({ hover = true, ...props }: FilesHighlightProps) {
  return (
    <Highlight data-slot="files-highlight" controlledItems mode="parent" hover={hover} {...props} />
  )
}

type FolderItemProps = AccordionItemProps

function FolderItem({ value, ...props }: FolderItemProps) {
  const { open } = useFiles()

  return (
    <FolderProvider value={{ isOpen: open.includes(value) }}>
      <AccordionItem data-slot="folder-item" value={value} {...props} />
    </FolderProvider>
  )
}

type FolderHeaderProps = AccordionHeaderProps

function FolderHeader(props: FolderHeaderProps) {
  return <AccordionHeader data-slot="folder-header" {...props} />
}

type FolderTriggerProps = AccordionTriggerProps

function FolderTrigger(props: FolderTriggerProps) {
  return <AccordionTrigger data-slot="folder-trigger" {...props} />
}

type FolderPanelProps = AccordionPanelProps

function FolderPanel(props: FolderPanelProps) {
  return <AccordionPanel data-slot="folder-panel" {...props} />
}

type FileHighlightProps = HighlightItemProps

function FileHighlight(props: FileHighlightProps) {
  return <HighlightItem data-slot="file-highlight" {...props} />
}

type FileProps = React.ComponentProps<"div">

function File(props: FileProps) {
  return <div data-slot="file" {...props} />
}

type FileIconProps = React.ComponentProps<"span">

function FileIcon(props: FileIconProps) {
  return <span data-slot="file-icon" {...props} />
}

type FileLabelProps = React.ComponentProps<"span">

function FileLabel(props: FileLabelProps) {
  return <span data-slot="file-label" {...props} />
}

type FolderHighlightProps = HighlightItemProps

function FolderHighlight(props: FolderHighlightProps) {
  return <HighlightItem data-slot="folder-highlight" {...props} />
}

type FolderProps = React.ComponentProps<"div">

function Folder(props: FolderProps) {
  return <div data-slot="folder" {...props} />
}

type FolderIconProps = HTMLMotionProps<"span"> & {
  closeIcon: React.ReactNode
  openIcon: React.ReactNode
}

function FolderIcon({
  closeIcon,
  openIcon,
  transition = { duration: 0.15 },
  ...props
}: FolderIconProps) {
  const { isOpen } = useFolder()

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={isOpen ? "open" : "close"}
        data-slot="folder-icon"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        transition={transition}
        {...props}
      >
        {isOpen ? openIcon : closeIcon}
      </motion.span>
    </AnimatePresence>
  )
}

type FolderLabelProps = React.ComponentProps<"span">

function FolderLabel(props: FolderLabelProps) {
  return <span data-slot="folder-label" {...props} />
}

export {
  File,
  FileHighlight,
  type FileHighlightProps,
  FileIcon,
  type FileIconProps,
  FileLabel,
  type FileLabelProps,
  type FileProps,
  Files,
  type FilesContextType,
  FilesHighlight,
  type FilesHighlightProps,
  type FilesProps,
  Folder,
  type FolderContextType,
  FolderHeader,
  type FolderHeaderProps,
  FolderHighlight,
  type FolderHighlightProps,
  FolderIcon,
  type FolderIconProps,
  FolderItem,
  type FolderItemProps,
  FolderLabel,
  type FolderLabelProps,
  FolderPanel,
  type FolderPanelProps,
  type FolderProps,
  FolderTrigger,
  type FolderTriggerProps,
  useFiles,
  useFolder,
}
