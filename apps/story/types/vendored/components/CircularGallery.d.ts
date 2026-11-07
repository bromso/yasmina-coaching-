interface CircularGalleryProps {
    items?: {
        image: string;
        text: string;
    }[];
    bend?: number;
    textColor?: string;
    borderRadius?: number;
    font?: string;
    scrollSpeed?: number;
    scrollEase?: number;
}
export default function CircularGallery({ items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase, }: CircularGalleryProps): import("react").JSX.Element;
export {};
