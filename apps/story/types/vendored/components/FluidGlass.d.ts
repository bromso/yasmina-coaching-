type Mode = "lens" | "bar" | "cube";
type ModeProps = Record<string, unknown>;
interface FluidGlassProps {
    mode?: Mode;
    lensProps?: ModeProps;
    barProps?: ModeProps;
    cubeProps?: ModeProps;
}
export default function FluidGlass({ mode, lensProps, barProps, cubeProps, }: FluidGlassProps): import("react").JSX.Element;
export {};
