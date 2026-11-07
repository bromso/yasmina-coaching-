interface CommonControlledStateProps<T> {
    value?: T;
    defaultValue?: T;
}
export declare function useControlledState<T, Rest extends unknown[] = []>(props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
}): readonly [T, (next: T, ...args: Rest) => void];
export {};
