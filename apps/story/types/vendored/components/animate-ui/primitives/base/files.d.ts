import { type AccordionHeaderProps, type AccordionItemProps, type AccordionPanelProps, type AccordionProps, type AccordionTriggerProps } from "@repo/ui/components/animate-ui/primitives/base/accordion";
import { type HighlightItemProps, type HighlightProps } from "@repo/ui/components/animate-ui/primitives/effects/highlight";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type FilesContextType = {
    open: string[];
};
type FolderContextType = {
    isOpen: boolean;
};
declare const useFiles: () => FilesContextType;
declare const useFolder: () => FolderContextType;
type FilesProps = {
    children: React.ReactNode;
    defaultOpen?: string[];
    open?: string[];
    onOpenChange?: (open: string[]) => void;
} & Omit<AccordionProps, "type" | "defaultValue" | "value" | "onValueChange">;
declare function Files({ children, defaultOpen, open, onOpenChange, style, ...props }: FilesProps): React.JSX.Element;
type FilesHighlightProps = Omit<HighlightProps, "controlledItems" | "mode">;
declare function FilesHighlight({ hover, ...props }: FilesHighlightProps): React.JSX.Element;
type FolderItemProps = AccordionItemProps;
declare function FolderItem({ value, ...props }: FolderItemProps): React.JSX.Element;
type FolderHeaderProps = AccordionHeaderProps;
declare function FolderHeader(props: FolderHeaderProps): React.JSX.Element;
type FolderTriggerProps = AccordionTriggerProps;
declare function FolderTrigger(props: FolderTriggerProps): React.JSX.Element;
type FolderPanelProps = AccordionPanelProps;
declare function FolderPanel(props: FolderPanelProps): React.JSX.Element;
type FileHighlightProps = HighlightItemProps;
declare function FileHighlight(props: FileHighlightProps): React.JSX.Element;
type FileProps = React.ComponentProps<"div">;
declare function File(props: FileProps): React.JSX.Element;
type FileIconProps = React.ComponentProps<"span">;
declare function FileIcon(props: FileIconProps): React.JSX.Element;
type FileLabelProps = React.ComponentProps<"span">;
declare function FileLabel(props: FileLabelProps): React.JSX.Element;
type FolderHighlightProps = HighlightItemProps;
declare function FolderHighlight(props: FolderHighlightProps): React.JSX.Element;
type FolderProps = React.ComponentProps<"div">;
declare function Folder(props: FolderProps): React.JSX.Element;
type FolderIconProps = HTMLMotionProps<"span"> & {
    closeIcon: React.ReactNode;
    openIcon: React.ReactNode;
};
declare function FolderIcon({ closeIcon, openIcon, transition, ...props }: FolderIconProps): React.JSX.Element;
type FolderLabelProps = React.ComponentProps<"span">;
declare function FolderLabel(props: FolderLabelProps): React.JSX.Element;
export { File, FileHighlight, type FileHighlightProps, FileIcon, type FileIconProps, FileLabel, type FileLabelProps, type FileProps, Files, type FilesContextType, FilesHighlight, type FilesHighlightProps, type FilesProps, Folder, type FolderContextType, FolderHeader, type FolderHeaderProps, FolderHighlight, type FolderHighlightProps, FolderIcon, type FolderIconProps, FolderItem, type FolderItemProps, FolderLabel, type FolderLabelProps, FolderPanel, type FolderPanelProps, type FolderProps, FolderTrigger, type FolderTriggerProps, useFiles, useFolder, };
