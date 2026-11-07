import * as AvatarPrimitive from "@radix-ui/react-avatar";
import type * as React from "react";
declare function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>): React.JSX.Element;
declare function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>): React.JSX.Element;
declare function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>): React.JSX.Element;
export { Avatar, AvatarFallback, AvatarImage };
