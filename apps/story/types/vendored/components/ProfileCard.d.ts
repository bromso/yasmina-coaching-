import React from "react";
interface ProfileCardProps {
    avatarUrl?: string;
    iconUrl?: string;
    grainUrl?: string;
    innerGradient?: string;
    behindGlowEnabled?: boolean;
    behindGlowColor?: string;
    behindGlowSize?: string;
    className?: string;
    enableTilt?: boolean;
    enableMobileTilt?: boolean;
    mobileTiltSensitivity?: number;
    miniAvatarUrl?: string;
    name?: string;
    title?: string;
    handle?: string;
    status?: string;
    contactText?: string;
    showUserInfo?: boolean;
    onContactClick?: () => void;
}
declare const ProfileCard: React.NamedExoticComponent<ProfileCardProps>;
export default ProfileCard;
