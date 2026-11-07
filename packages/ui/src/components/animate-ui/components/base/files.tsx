import {
  FileHighlight as FileHighlightPrimitive,
  FileIcon as FileIconPrimitive,
  FileLabel as FileLabelPrimitive,
  type FileLabelProps as FileLabelPrimitiveProps,
  File as FilePrimitive,
  type FileProps as FilePrimitiveProps,
  FilesHighlight as FilesHighlightPrimitive,
  Files as FilesPrimitive,
  type FilesProps as FilesPrimitiveProps,
  FolderHeader as FolderHeaderPrimitive,
  FolderHighlight as FolderHighlightPrimitive,
  FolderIcon as FolderIconPrimitive,
  FolderItem as FolderItemPrimitive,
  type FolderItemProps as FolderItemPrimitiveProps,
  FolderPanel as FolderPanelPrimitive,
  type FolderPanelProps as FolderPanelPrimitiveProps,
  Folder as FolderPrimitive,
  FolderTrigger as FolderTriggerPrimitive,
} from "@repo/ui/components/animate-ui/primitives/base/files"
import { Icon as IconifyIcon } from "@repo/ui/components/icon"
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type GitStatus = "untracked" | "modified" | "deleted"

type FilesProps = FilesPrimitiveProps

function Files({ className, children, ...props }: FilesProps) {
  return (
    <FilesPrimitive className={cn("p-2 w-full", className)} {...props}>
      <FilesHighlightPrimitive className="bg-accent rounded-lg pointer-events-none">
        {children}
      </FilesHighlightPrimitive>
    </FilesPrimitive>
  )
}

type SubFilesProps = FilesProps

function SubFiles(props: SubFilesProps) {
  return <FilesPrimitive {...props} />
}

type FolderItemProps = FolderItemPrimitiveProps

function FolderItem(props: FolderItemProps) {
  return <FolderItemPrimitive {...props} />
}

type FolderTriggerProps = FileLabelPrimitiveProps & {
  gitStatus?: GitStatus
}

function FolderTrigger({ children, className, gitStatus, ...props }: FolderTriggerProps) {
  return (
    <FolderHeaderPrimitive>
      <FolderTriggerPrimitive className="w-full text-start">
        <FolderHighlightPrimitive>
          <FolderPrimitive className="flex items-center justify-between gap-2 p-2 pointer-events-none">
            <div
              className={cn(
                "flex items-center gap-2",
                gitStatus === "untracked" && "text-green-400",
                gitStatus === "modified" && "text-amber-400",
                gitStatus === "deleted" && "text-red-400"
              )}
            >
              <FolderIconPrimitive
                closeIcon={<IconifyIcon icon="lucide:folder" className="size-4.5" />}
                openIcon={<IconifyIcon icon="lucide:folder-open" className="size-4.5" />}
              />
              <FileLabelPrimitive className={cn("text-sm", className)} {...props}>
                {children}
              </FileLabelPrimitive>
            </div>

            {gitStatus && (
              <span
                className={cn(
                  "rounded-full size-2",
                  gitStatus === "untracked" && "bg-green-400",
                  gitStatus === "modified" && "bg-amber-400",
                  gitStatus === "deleted" && "bg-red-400"
                )}
              />
            )}
          </FolderPrimitive>
        </FolderHighlightPrimitive>
      </FolderTriggerPrimitive>
    </FolderHeaderPrimitive>
  )
}

type FolderPanelProps = FolderPanelPrimitiveProps

function FolderPanel(props: FolderPanelProps) {
  return (
    <div className="relative ml-6 before:absolute before:-left-2 before:inset-y-0 before:w-px before:h-full before:bg-border">
      <FolderPanelPrimitive {...props} />
    </div>
  )
}

const DefaultFileIcon = (props: { className?: string }) => (
  <IconifyIcon icon="lucide:file" {...props} />
)

type FileItemProps = FilePrimitiveProps & {
  icon?: React.ElementType
  gitStatus?: GitStatus
}

function FileItem({
  icon: Icon = DefaultFileIcon,
  className,
  children,
  gitStatus,
  ...props
}: FileItemProps) {
  return (
    <FileHighlightPrimitive>
      <FilePrimitive
        className={cn(
          "flex items-center justify-between gap-2 p-2 pointer-events-none",
          gitStatus === "untracked" && "text-green-400",
          gitStatus === "modified" && "text-amber-400",
          gitStatus === "deleted" && "text-red-400"
        )}
      >
        <div className="flex items-center gap-2">
          <FileIconPrimitive>
            <Icon className="size-4.5" />
          </FileIconPrimitive>
          <FileLabelPrimitive className={cn("text-sm", className)} {...props}>
            {children}
          </FileLabelPrimitive>
        </div>

        {gitStatus && (
          <span className="text-sm font-medium">
            {gitStatus === "untracked" && "U"}
            {gitStatus === "modified" && "M"}
            {gitStatus === "deleted" && "D"}
          </span>
        )}
      </FilePrimitive>
    </FileHighlightPrimitive>
  )
}

export {
  FileItem,
  type FileItemProps,
  Files,
  type FilesProps,
  FolderItem,
  type FolderItemProps,
  FolderPanel,
  type FolderPanelProps,
  FolderTrigger,
  type FolderTriggerProps,
  SubFiles,
  type SubFilesProps,
}
