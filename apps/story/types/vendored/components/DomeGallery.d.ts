type ImageItem = string | {
    src: string;
    alt?: string;
};
type DomeGalleryProps = {
    images?: ImageItem[];
    fit?: number;
    fitBasis?: "auto" | "min" | "max" | "width" | "height";
    minRadius?: number;
    maxRadius?: number;
    padFactor?: number;
    overlayBlurColor?: string;
    maxVerticalRotationDeg?: number;
    dragSensitivity?: number;
    enlargeTransitionMs?: number;
    segments?: number;
    dragDampening?: number;
    openedImageWidth?: string;
    openedImageHeight?: string;
    imageBorderRadius?: string;
    openedImageBorderRadius?: string;
    grayscale?: boolean;
};
export default function DomeGallery({ images, fit, fitBasis, minRadius, maxRadius, padFactor, overlayBlurColor, maxVerticalRotationDeg, dragSensitivity, enlargeTransitionMs, segments, dragDampening, openedImageWidth, openedImageHeight, imageBorderRadius, openedImageBorderRadius, grayscale, }: DomeGalleryProps): import("react").JSX.Element;
export {};
