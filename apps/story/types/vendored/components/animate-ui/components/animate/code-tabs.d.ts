import { type TabsProps } from "@repo/ui/components/animate-ui/primitives/animate/tabs";
import * as React from "react";
type CodeTabsProps = {
    codes: Record<string, string>;
    lang?: string;
    themes?: {
        light: string;
        dark: string;
    };
    copyButton?: boolean;
    onCopiedChange?: (copied: boolean, content?: string) => void;
} & Omit<TabsProps, "children">;
declare function CodeTabs({ codes, lang, themes, className, defaultValue, value, onValueChange, copyButton, onCopiedChange, ...props }: CodeTabsProps): React.JSX.Element;
export { CodeTabs, type CodeTabsProps };
