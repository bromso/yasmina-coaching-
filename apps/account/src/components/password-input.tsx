import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { cn } from "@repo/ui/lib/utils"
import { useTranslations } from "next-intl"
import * as React from "react"

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = "", disabled, id, ...props }, ref) => {
    const t = useTranslations("account.password")
    const [showPassword, setShowPassword] = React.useState(false)
    return (
      <div className={cn("relative", className)}>
        <Input
          type={showPassword ? "text" : "password"}
          className="pr-10"
          ref={ref}
          id={id}
          disabled={disabled}
          {...props}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          // The input's full height (36px) rather than a 24px button floating inside it: WCAG
          // 2.5.8 wants a 24x24 target, and this one sits inside the input with no spacing to
          // rely on, so it keeps its 24px even with part of it scrolled under the account app's
          // sticky header (whose locale-switcher button axe then counts as overlapping it).
          className="text-muted-foreground absolute top-0 right-0 h-9 w-9"
          aria-label={t(showPassword ? "hide" : "show")}
          aria-pressed={showPassword}
          aria-controls={id}
          onClick={() => setShowPassword((prev) => !prev)}
        >
          {showPassword ? (
            <Icon icon="mdi:eye" width={18} height={18} aria-hidden="true" />
          ) : (
            <Icon icon="mdi:eye-off" width={18} height={18} aria-hidden="true" />
          )}
        </Button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
