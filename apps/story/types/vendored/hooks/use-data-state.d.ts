import * as React from "react";
type DataStateValue = string | boolean | null;
declare function useDataState<T extends HTMLElement = HTMLElement>(key: string, forwardedRef?: React.Ref<T | null>, onChange?: (value: DataStateValue) => void): [DataStateValue, React.RefObject<T | null>];
export { type DataStateValue, useDataState };
