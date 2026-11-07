import type { ComponentPropsWithoutRef } from "react"
import { CodeBlockFrame } from "./code-block-frame"
import { CopyButton } from "./copy-button"

export { CodeBlockFrame, type CodeBlockFrameProps } from "./code-block-frame"
export { CopyButton, copyToClipboard } from "./copy-button"
export { CopyControls, type CopyControlsProps, type CopyStatus } from "./copy-controls"

export type CodeBlockProps = ComponentPropsWithoutRef<"pre"> & {
  title?: string
}

/**
 * `mdxComponents.pre`: `CodeBlockFrame` with a live `CopyButton` in its actions slot. No hooks of
 * its own — the copy button is where the Client Component boundary actually sits — so this file
 * has no `"use client"` directive either; it simply composes one.
 */
export function CodeBlock({ title, ...props }: CodeBlockProps) {
  return <CodeBlockFrame title={title} actions={<CopyButton />} {...props} />
}
