import { type FileLabelProps as FileLabelPrimitiveProps, type FileProps as FilePrimitiveProps, type FilesProps as FilesPrimitiveProps, type FolderItemProps as FolderItemPrimitiveProps, type FolderPanelProps as FolderPanelPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/files";
import type * as React from "react";
type GitStatus = "untracked" | "modified" | "deleted";
type FilesProps = FilesPrimitiveProps;
declare function Files({ className, children, ...props }: FilesProps): React.JSX.Element;
type SubFilesProps = FilesProps;
declare function SubFiles(props: SubFilesProps): React.JSX.Element;
type FolderItemProps = FolderItemPrimitiveProps;
declare function FolderItem(props: FolderItemProps): React.JSX.Element;
type FolderTriggerProps = FileLabelPrimitiveProps & {
    gitStatus?: GitStatus;
};
declare function FolderTrigger({ children, className, gitStatus, ...props }: FolderTriggerProps): React.JSX.Element;
type FolderPanelProps = FolderPanelPrimitiveProps;
declare function FolderPanel(props: FolderPanelProps): React.JSX.Element;
type FileItemProps = FilePrimitiveProps & {
    icon?: React.ElementType;
    gitStatus?: GitStatus;
};
declare function FileItem({ icon: Icon, className, children, gitStatus, ...props }: FileItemProps): React.JSX.Element;
export { FileItem, type FileItemProps, Files, type FilesProps, FolderItem, type FolderItemProps, FolderPanel, type FolderPanelProps, FolderTrigger, type FolderTriggerProps, SubFiles, type SubFilesProps, };
