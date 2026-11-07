import { type CodeBlockProps as CodeBlockPropsPrimitive } from "@repo/ui/components/animate-ui/primitives/animate/code-block";
import * as React from "react";
type CodeProps = React.ComponentProps<"div"> & {
    code: string;
};
declare function Code({ className, code, ...props }: CodeProps): React.JSX.Element;
type CodeHeaderProps = React.ComponentProps<"div"> & {
    icon?: React.ElementType;
    copyButton?: boolean;
};
declare function CodeHeader({ className, children, icon: Icon, copyButton, ...props }: CodeHeaderProps): React.JSX.Element;
type CodeBlockProps = Omit<CodeBlockPropsPrimitive, "code"> & {
    cursor?: boolean;
};
declare function CodeBlock({ cursor, className, ...props }: CodeBlockProps): React.JSX.Element;
export { Code, CodeBlock, type CodeBlockProps, CodeHeader, type CodeHeaderProps, type CodeProps };
