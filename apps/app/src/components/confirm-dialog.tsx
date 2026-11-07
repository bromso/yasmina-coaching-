"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog"
import { Button } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"
import { useTranslations } from "next-intl"
import type React from "react"
import type { JSX } from "react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  disabled?: boolean
  desc: JSX.Element | string
  cancelBtnText?: string
  confirmText?: React.ReactNode
  destructive?: boolean
  handleConfirm: () => void
  isLoading?: boolean
  className?: string
  children?: React.ReactNode
}

export function ConfirmDialog(props: Props) {
  const {
    title,
    desc,
    children,
    className,
    confirmText,
    cancelBtnText,
    destructive,
    isLoading,
    disabled = false,
    handleConfirm,
    ...actions
  } = props
  const t = useTranslations("app.confirm")
  return (
    <AlertDialog {...actions}>
      <AlertDialogContent className={cn(className && className)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{desc}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelBtnText ?? t("cancel")}</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={disabled || isLoading}
          >
            {confirmText ?? t("continue")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
