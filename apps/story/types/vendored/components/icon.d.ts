import { type IconProps as IconifyIconProps } from "@iconify/react";
type IconProps = Omit<IconifyIconProps, "icon"> & {
    icon: string;
};
declare function Icon({ icon, className, ...props }: IconProps): import("react").JSX.Element;
export { Icon };
