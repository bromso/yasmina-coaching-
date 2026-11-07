import { type SwitchProps as SwitchPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/switch";
import type * as React from "react";
type SwitchProps = SwitchPrimitiveProps & {
    pressedWidth?: number;
    startIcon?: React.ReactElement;
    endIcon?: React.ReactElement;
    thumbIcon?: React.ReactElement;
};
declare function Switch({ className, pressedWidth, startIcon, endIcon, thumbIcon, ...props }: SwitchProps): React.JSX.Element;
export { Switch, type SwitchProps };
