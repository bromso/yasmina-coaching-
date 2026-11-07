import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type PinnedListContextType = {
    movingId: string | null;
    setMovingId: (id: string | null) => void;
    onPinnedChange?: (id: string) => void;
};
type PinnedListItemContextType = {
    id: string;
};
declare const usePinnedList: () => PinnedListContextType;
declare const usePinnedListItem: () => PinnedListItemContextType;
type PinnedListProps = HTMLMotionProps<"div"> & {
    children: React.ReactNode;
    onPinnedChange?: (id: string) => void;
};
declare function PinnedList({ children, onPinnedChange, ...props }: PinnedListProps): React.JSX.Element;
type PinnedListPinnedProps = React.ComponentProps<"div"> & {
    children: React.ReactNode;
};
declare function PinnedListPinned(props: PinnedListPinnedProps): React.JSX.Element;
type PinnedListUnpinnedProps = React.ComponentProps<"div"> & {
    children: React.ReactNode;
};
declare function PinnedListUnpinned(props: PinnedListUnpinnedProps): React.JSX.Element;
type PinnedListLabelProps = WithAsChild<HTMLMotionProps<"p"> & {
    hide?: boolean;
}>;
declare function PinnedListLabel({ hide, asChild, transition, ...props }: PinnedListLabelProps): React.JSX.Element;
type PinnedListItemsProps = React.ComponentProps<"div"> & {
    children: React.ReactNode;
};
declare function PinnedListItems(props: PinnedListItemsProps): React.JSX.Element;
type PinnedListItemProps = WithAsChild<HTMLMotionProps<"div"> & {
    id: string;
    children: React.ReactNode;
    customTrigger?: boolean;
}>;
declare function PinnedListItem({ id, asChild, customTrigger, transition, onClick, ...props }: PinnedListItemProps): React.JSX.Element;
type PinnedListTriggerProps = WithAsChild<HTMLMotionProps<"button">>;
declare function PinnedListTrigger({ asChild, onClick, ...props }: PinnedListTriggerProps): React.JSX.Element;
export { PinnedList, type PinnedListContextType, PinnedListItem, type PinnedListItemContextType, type PinnedListItemProps, PinnedListItems, type PinnedListItemsProps, PinnedListLabel, type PinnedListLabelProps, PinnedListPinned, type PinnedListPinnedProps, type PinnedListProps, PinnedListTrigger, type PinnedListTriggerProps, PinnedListUnpinned, type PinnedListUnpinnedProps, usePinnedList, usePinnedListItem, };
