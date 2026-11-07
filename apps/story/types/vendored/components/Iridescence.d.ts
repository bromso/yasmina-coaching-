interface IridescenceProps {
    color?: [number, number, number];
    speed?: number;
    amplitude?: number;
    mouseReact?: boolean;
}
export default function Iridescence({ color, speed, amplitude, mouseReact, ...rest }: IridescenceProps): import("react").JSX.Element;
export {};
