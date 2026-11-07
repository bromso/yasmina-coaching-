import { cn } from "@repo/ui/lib/utils"

interface GradientBlurProps {
  /**
   * Additional CSS classes to apply to the wrapper
   */
  className?: string
  /**
   * Height of the gradient blur effect as a percentage
   * @default "65%"
   */
  height?: string
  /**
   * Position of the blur effect
   * @default "bottom"
   */
  position?: "top" | "bottom"
  /**
   * Intensity multiplier for blur values
   * @default 1
   */
  intensity?: number
  /**
   * Children to render behind the blur effect
   */
  children?: React.ReactNode
}

/**
 * GradientBlur creates a layered backdrop-filter blur effect that transitions
 * smoothly from transparent to heavily blurred. Perfect for creating depth
 * and focus effects over scrollable content.
 */
export default function GradientBlur({
  className,
  height = "65%",
  position = "bottom",
  intensity = 1,
  children,
}: GradientBlurProps) {
  // Generate blur layers with progressive intensity
  const blurLayers = [
    { blur: 0.5 * intensity, maskStart: 0, maskPeak1: 12.5, maskPeak2: 25, maskEnd: 37.5 },
    { blur: 1 * intensity, maskStart: 12.5, maskPeak1: 25, maskPeak2: 37.5, maskEnd: 50 },
    { blur: 2 * intensity, maskStart: 25, maskPeak1: 37.5, maskPeak2: 50, maskEnd: 62.5 },
    { blur: 4 * intensity, maskStart: 37.5, maskPeak1: 50, maskPeak2: 62.5, maskEnd: 75 },
    { blur: 8 * intensity, maskStart: 50, maskPeak1: 62.5, maskPeak2: 75, maskEnd: 87.5 },
    { blur: 16 * intensity, maskStart: 62.5, maskPeak1: 75, maskPeak2: 87.5, maskEnd: 100 },
    { blur: 32 * intensity, maskStart: 75, maskPeak1: 87.5, maskPeak2: 100, maskEnd: null },
    { blur: 64 * intensity, maskStart: 87.5, maskPeak1: 100, maskPeak2: null, maskEnd: null },
  ]

  // blurLayers is a fixed-length literal above, so the first/last elements
  // always exist; narrow explicitly since indexed reads are `T | undefined`.
  const firstLayer = blurLayers[0]
  const lastLayer = blurLayers[blurLayers.length - 1]
  if (!firstLayer || !lastLayer) return null

  const createMask = (layer: (typeof blurLayers)[0]) => {
    const direction = position === "bottom" ? "to bottom" : "to top"

    if (layer.maskEnd === null && layer.maskPeak2 === null) {
      // Final layer
      return `linear-gradient(${direction}, rgba(0,0,0,0) ${layer.maskStart}%, rgba(0,0,0,1) ${layer.maskPeak1}%)`
    }
    if (layer.maskEnd === null) {
      // Second to last layer
      return `linear-gradient(${direction}, rgba(0,0,0,0) ${layer.maskStart}%, rgba(0,0,0,1) ${layer.maskPeak1}%, rgba(0,0,0,1) ${layer.maskPeak2}%)`
    }
    // Regular layers
    return `linear-gradient(${direction}, rgba(0,0,0,0) ${layer.maskStart}%, rgba(0,0,0,1) ${layer.maskPeak1}%, rgba(0,0,0,1) ${layer.maskPeak2}%, rgba(0,0,0,0) ${layer.maskEnd}%)`
  }

  const positionStyles =
    position === "bottom" ? { inset: "auto 0 0 0", height } : { inset: "0 0 auto 0", height }

  return (
    <div className={cn("relative", className)}>
      {children}
      <div
        className="fixed z-10 pointer-events-none"
        style={{
          ...positionStyles,
          left: "var(--sidebar-width, 0px)",
          width: "calc(100% - var(--sidebar-width, 0px))",
        }}
      >
        {/* Before pseudo-element equivalent - first layer */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 1,
            backdropFilter: `blur(${firstLayer.blur}px)`,
            mask: createMask(firstLayer),
            WebkitMask: createMask(firstLayer),
          }}
        />

        {/* Middle layers */}
        {blurLayers.slice(1, -1).map((layer, index) => (
          <div
            key={layer.blur}
            className="absolute inset-0"
            style={{
              zIndex: index + 2,
              backdropFilter: `blur(${layer.blur}px)`,
              mask: createMask(layer),
              WebkitMask: createMask(layer),
            }}
          />
        ))}

        {/* After pseudo-element equivalent - last layer */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 8,
            backdropFilter: `blur(${lastLayer.blur}px)`,
            mask: createMask(lastLayer),
            WebkitMask: createMask(lastLayer),
          }}
        />
      </div>
    </div>
  )
}
