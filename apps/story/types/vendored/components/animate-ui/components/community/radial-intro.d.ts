import * as React from "react";
interface ComponentProps {
    orbitItems: OrbitItem[];
    stageSize?: number;
    imageSize?: number;
}
type OrbitItem = {
    id: number;
    name: string;
    src: string;
};
declare function RadialIntro({ orbitItems, stageSize, imageSize }: ComponentProps): React.JSX.Element;
export { RadialIntro };
