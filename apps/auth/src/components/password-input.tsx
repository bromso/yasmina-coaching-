import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { cn } from "@repo/ui/lib/utils"
import { useTranslations } from "next-intl"
import * as React from "react"

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = "", disabled, id, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)
    const t = useTranslations("auth.common")
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
          className="text-muted-foreground absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2"
          aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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
