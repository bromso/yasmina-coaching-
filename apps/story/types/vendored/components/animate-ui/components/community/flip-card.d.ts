import * as React from "react";
export interface FlipCardData {
    name: string;
    username: string;
    image: string;
    bio: string;
    stats: {
        following: number;
        followers: number;
        posts?: number;
    };
    socialLinks?: {
        linkedin?: string;
        github?: string;
        twitter?: string;
    };
}
interface FlipCardProps {
    data: FlipCardData;
}
export declare function FlipCard({ data }: FlipCardProps): React.JSX.Element;
export {};
