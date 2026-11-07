import {
  PreviewCardBackdrop as PreviewCardBackdropPrimitive,
  type PreviewCardBackdropProps as PreviewCardBackdropPrimitiveProps,
  PreviewCardPopup as PreviewCardPopupPrimitive,
  type PreviewCardPopupProps as PreviewCardPopupPrimitiveProps,
  PreviewCardPortal as PreviewCardPortalPrimitive,
  PreviewCardPositioner as PreviewCardPositionerPrimitive,
  type PreviewCardPositionerProps as PreviewCardPositionerPrimitiveProps,
  PreviewCard as PreviewCardPrimitive,
  type PreviewCardProps as PreviewCardPrimitiveProps,
  PreviewCardTrigger as PreviewCardTriggerPrimitive,
  type PreviewCardTriggerProps as PreviewCardTriggerPrimitiveProps,
} from "@repo/ui/components/animate-ui/primitives/base/preview-card"
import { cn } from "@repo/ui/lib/utils"

type PreviewCardProps = PreviewCardPrimitiveProps

function PreviewCard(props: PreviewCardProps) {
  return <PreviewCardPrimitive {...props} />
}

type PreviewCardTriggerProps = PreviewCardTriggerPrimitiveProps

function PreviewCardTrigger(props: PreviewCardTriggerProps) {
  return <PreviewCardTriggerPrimitive {...props} />
}

type PreviewCardPanelProps = PreviewCardPositionerPrimitiveProps & PreviewCardPopupPrimitiveProps

function PreviewCardPanel({
  className,
  align = "center",
  sideOffset = 4,
  style,
  children,
  ...props
}: PreviewCardPanelProps) {
  return (
    <PreviewCardPortalPrimitive>
      <PreviewCardPositionerPrimitive
        align={align}
        sideOffset={sideOffset}
        className="z-50"
        {...props}
      >
        <PreviewCardPopupPrimitive
          className={cn(
            "bg-popover text-popover-foreground w-64 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden",
            className
          )}
          style={style}
        >
          {children}
        </PreviewCardPopupPrimitive>
      </PreviewCardPositionerPrimitive>
    </PreviewCardPortalPrimitive>
  )
}

type PreviewCardBackdropProps = PreviewCardBackdropPrimitiveProps

function PreviewCardBackdrop(props: PreviewCardBackdropProps) {
  return <PreviewCardBackdropPrimitive {...props} />
}

export {
  PreviewCard,
  PreviewCardBackdrop,
  type PreviewCardBackdropProps,
  PreviewCardPanel,
  type PreviewCardPanelProps,
  type PreviewCardProps,
  PreviewCardTrigger,
  type PreviewCardTriggerProps,
}
