"use client"

import { cn } from "@repo/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { type Accept, type DropzoneOptions, type FileRejection, useDropzone } from "react-dropzone"
import { Icon } from "./icon"

const dropzoneVariants = cva(
  "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors outline-none",
  {
    variants: {
      variant: {
        default:
          "border-muted-foreground/25 bg-muted/50 hover:border-muted-foreground/50 hover:bg-muted",
        outline: "border-input bg-background hover:border-ring hover:bg-accent/50",
      },
      size: {
        default: "min-h-[150px] p-6",
        sm: "min-h-[100px] p-4",
        lg: "min-h-[200px] p-8",
      },
      state: {
        default: "",
        active: "border-primary bg-primary/5",
        accept: "border-green-500 bg-green-500/5",
        reject: "border-destructive bg-destructive/5",
        disabled: "cursor-not-allowed opacity-50",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      state: "default",
    },
  }
)

export interface DropzoneProps
  extends Omit<DropzoneOptions, "onDrop">,
    VariantProps<typeof dropzoneVariants> {
  className?: string
  onDrop?: (acceptedFiles: File[], rejectedFiles: FileRejection[]) => void
  onFilesChange?: (files: File[]) => void
  showPreview?: boolean
  maxFiles?: number
  maxSize?: number
  accept?: Accept
  disabled?: boolean
  children?: React.ReactNode
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const dm = Math.max(decimals, 0)
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

function Dropzone({
  className,
  variant,
  size,
  onDrop,
  onFilesChange,
  showPreview = true,
  maxFiles = 1,
  maxSize = 5 * 1024 * 1024, // 5MB default
  accept,
  disabled = false,
  children,
  ...props
}: DropzoneProps) {
  const [files, setFiles] = React.useState<File[]>([])

  const handleDrop = React.useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      const newFiles = maxFiles === 1 ? acceptedFiles.slice(0, 1) : acceptedFiles
      setFiles((prev) => {
        const updated = maxFiles === 1 ? newFiles : [...prev, ...newFiles].slice(0, maxFiles)
        onFilesChange?.(updated)
        return updated
      })
      onDrop?.(acceptedFiles, rejectedFiles)
    },
    [maxFiles, onDrop, onFilesChange]
  )

  const removeFile = React.useCallback(
    (fileToRemove: File) => {
      setFiles((prev) => {
        const updated = prev.filter((f) => f !== fileToRemove)
        onFilesChange?.(updated)
        return updated
      })
    },
    [onFilesChange]
  )

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop: handleDrop,
    maxFiles,
    maxSize,
    accept,
    disabled,
    ...props,
  })

  const state = React.useMemo(() => {
    if (disabled) return "disabled"
    if (isDragReject) return "reject"
    if (isDragAccept) return "accept"
    if (isDragActive) return "active"
    return "default"
  }, [disabled, isDragActive, isDragAccept, isDragReject])

  const acceptedTypes = React.useMemo(() => {
    if (!accept) return null
    const types = Object.values(accept).flat()
    return types.length > 0 ? types.join(", ") : null
  }, [accept])

  return (
    <div className="w-full space-y-4">
      <div
        {...getRootProps()}
        data-slot="dropzone"
        className={cn(dropzoneVariants({ variant, size, state }), className)}
      >
        <input {...getInputProps()} />
        {children ?? (
          <div className="flex flex-col items-center gap-2 text-center">
            <div
              className={cn(
                "rounded-full p-3",
                state === "accept" && "bg-green-500/10 text-green-500",
                state === "reject" && "bg-destructive/10 text-destructive",
                state === "active" && "bg-primary/10 text-primary",
                state === "default" && "bg-muted text-muted-foreground"
              )}
            >
              <Icon
                icon={
                  state === "reject"
                    ? "lucide:x-circle"
                    : state === "accept"
                      ? "lucide:check-circle"
                      : "lucide:upload-cloud"
                }
                className="size-6"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragActive
                  ? isDragReject
                    ? "File type not accepted"
                    : "Drop files here"
                  : "Drag & drop files here"}
              </p>
              <p className="text-muted-foreground text-xs">
                or click to browse
                {maxSize && ` (max ${formatBytes(maxSize)})`}
              </p>
              {acceptedTypes && (
                <p className="text-muted-foreground text-xs">Accepted: {acceptedTypes}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {showPreview && files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={`${file.name}-${file.lastModified}`}
              className="bg-muted/50 flex items-center gap-3 rounded-lg border p-3 m-4"
            >
              <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
                <Icon icon={getFileIcon(file.type)} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(file)
                }}
                className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
                aria-label={`Remove ${file.name}`}
              >
                <Icon icon="lucide:x" className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "lucide:image"
  if (mimeType.startsWith("video/")) return "lucide:video"
  if (mimeType.startsWith("audio/")) return "lucide:music"
  if (mimeType === "application/pdf") return "lucide:file-text"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "lucide:table"
  if (mimeType.includes("document") || mimeType.includes("word")) return "lucide:file-text"
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "lucide:archive"
  return "lucide:file"
}

export { Dropzone, dropzoneVariants }
