import { type FC } from "react";
interface MenuItem {
    image: string;
    link: string;
    title: string;
    description: string;
}
interface InfiniteMenuProps {
    items?: MenuItem[];
    scale?: number;
}
declare const InfiniteMenu: FC<InfiniteMenuProps>;
export default InfiniteMenu;
