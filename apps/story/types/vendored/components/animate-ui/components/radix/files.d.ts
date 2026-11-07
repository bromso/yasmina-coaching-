import { type FileLabelProps as FileLabelPrimitiveProps, type FileProps as FilePrimitiveProps, type FilesProps as FilesPrimitiveProps, type FolderContentProps as FolderContentPrimitiveProps, type FolderItemProps as FolderItemPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/files";
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
type FolderContentProps = FolderContentPrimitiveProps;
declare function FolderContent(props: FolderContentProps): React.JSX.Element;
type FileItemProps = FilePrimitiveProps & {
    icon?: React.ElementType;
    gitStatus?: GitStatus;
};
declare function FileItem({ icon: Icon, className, children, gitStatus, ...props }: FileItemProps): React.JSX.Element;
export { FileItem, type FileItemProps, Files, type FilesProps, FolderContent, type FolderContentProps, FolderItem, type FolderItemProps, FolderTrigger, type FolderTriggerProps, SubFiles, type SubFilesProps, };
