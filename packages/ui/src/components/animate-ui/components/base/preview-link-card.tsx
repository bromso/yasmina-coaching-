import {
  PreviewLinkCardBackdrop as PreviewLinkCardBackdropPrimitive,
  type PreviewLinkCardBackdropProps as PreviewLinkCardBackdropPrimitiveProps,
  PreviewLinkCardImage as PreviewLinkCardImagePrimitive,
  type PreviewLinkCardImageProps as PreviewLinkCardImagePrimitiveProps,
  PreviewLinkCardPopup as PreviewLinkCardPopupPrimitive,
  type PreviewLinkCardPopupProps as PreviewLinkCardPopupPrimitiveProps,
  PreviewLinkCardPortal as PreviewLinkCardPortalPrimitive,
  PreviewLinkCardPositioner as PreviewLinkCardPositionerPrimitive,
  type PreviewLinkCardPositionerProps as PreviewLinkCardPositionerPrimitiveProps,
  PreviewLinkCard as PreviewLinkCardPrimitive,
  type PreviewLinkCardProps as PreviewLinkCardPrimitiveProps,
  PreviewLinkCardTrigger as PreviewLinkCardTriggerPrimitive,
  type PreviewLinkCardTriggerProps as PreviewLinkCardTriggerPrimitiveProps,
} from "@repo/ui/components/animate-ui/primitives/base/preview-link-card"
import { cn } from "@repo/ui/lib/utils"

type PreviewLinkCardProps = PreviewLinkCardPrimitiveProps

function PreviewLinkCard(props: PreviewLinkCardProps) {
  return <PreviewLinkCardPrimitive {...props} />
}

type PreviewLinkCardTriggerProps = PreviewLinkCardTriggerPrimitiveProps

function PreviewLinkCardTrigger(props: PreviewLinkCardTriggerProps) {
  return <PreviewLinkCardTriggerPrimitive {...props} />
}

type PreviewLinkCardPanelProps = PreviewLinkCardPositionerPrimitiveProps &
  PreviewLinkCardPopupPrimitiveProps

function PreviewLinkCardPanel({
  className,
  align = "center",
  sideOffset = 4,
  style,
  children,
  ...props
}: PreviewLinkCardPanelProps) {
  return (
    <PreviewLinkCardPortalPrimitive>
      <PreviewLinkCardPositionerPrimitive
        align={align}
        sideOffset={sideOffset}
        className="z-50"
        {...props}
      >
        <PreviewLinkCardPopupPrimitive
          className={cn(
            "border origin-(--transform-origin) rounded-md shadow-md outline-hidden overflow-hidden",
            className
          )}
          style={style}
        >
          {children}
        </PreviewLinkCardPopupPrimitive>
      </PreviewLinkCardPositionerPrimitive>
    </PreviewLinkCardPortalPrimitive>
  )
}

type PreviewLinkCardBackdropProps = PreviewLinkCardBackdropPrimitiveProps

function PreviewLinkCardBackdrop(props: PreviewLinkCardBackdropProps) {
  return <PreviewLinkCardBackdropPrimitive {...props} />
}

type PreviewLinkCardImageProps = PreviewLinkCardImagePrimitiveProps

function PreviewLinkCardImage(props: PreviewLinkCardImageProps) {
  return <PreviewLinkCardImagePrimitive {...props} />
}

export {
  PreviewLinkCard,
  PreviewLinkCardBackdrop,
  type PreviewLinkCardBackdropProps,
  PreviewLinkCardImage,
  type PreviewLinkCardImageProps,
  PreviewLinkCardPanel,
  type PreviewLinkCardPanelProps,
  type PreviewLinkCardProps,
  PreviewLinkCardTrigger,
  type PreviewLinkCardTriggerProps,
}
