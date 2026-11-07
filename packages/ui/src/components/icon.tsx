"use client"

import {
  addCollection,
  Icon as IconifyIcon,
  type IconProps as IconifyIconProps,
} from "@iconify/react"
import { lucideBundle } from "@repo/ui/lib/icon-bundle"
import { cn } from "@repo/ui/lib/utils"

// Register the offline icon bundle once per runtime. This module is a client
// module (@iconify/react requires it), but client components still render
// their HTML during SSR — so bundled icons render synchronously, server-side,
// and fully offline. Names outside the bundle fall back to the Iconify API.
// Regenerate the bundle with `bun icons:bundle` after adding new icons.
addCollection(lucideBundle)

// Iconify's own `IconProps` (SVG intrinsic props & IconifyIconProps) is used
// directly instead of `React.ComponentProps<"svg">`: several props (`mode`,
// `onLoad`, `rotate`, ...) share a name between the two but mean different
// things, so a generic SVG props type is never truly assignable to what this
// component forwards. Iconify's own type is exactly what it forwards.
type IconProps = Omit<IconifyIconProps, "icon"> & {
  icon: string
}

function Icon({ icon, className, ...props }: IconProps) {
  return <IconifyIcon icon={icon} ssr className={cn("size-4 shrink-0", className)} {...props} />
}

export { Icon }
