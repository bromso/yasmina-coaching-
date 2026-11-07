import { Avatar, AvatarFallback } from "@repo/ui/components/avatar"
import { cn } from "@repo/ui/lib/utils"

interface ProfileBadgeProps {
  /** Full name, used for the accessible label. */
  name: string
  /** Initials shown while no image is available. */
  initials: string
  className?: string
  fallbackClassName?: string
}

export function ProfileBadge({ name, initials, className, fallbackClassName }: ProfileBadgeProps) {
  return (
    <Avatar className={className} aria-label={name} role="img">
      <AvatarFallback
        className={cn(
          "bg-primary text-primary-foreground font-medium select-none",
          fallbackClassName
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
