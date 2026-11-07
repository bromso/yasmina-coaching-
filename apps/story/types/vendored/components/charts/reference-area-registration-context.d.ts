import type { ReferenceAreaConfig } from "./reference-area-config";
export interface ReferenceAreaRegistrationContextValue {
    registerReferenceArea: (id: string, config: ReferenceAreaConfig) => void;
    unregisterReferenceArea: (id: string) => void;
}
export declare const ReferenceAreaRegistrationContext: import("react").Context<ReferenceAreaRegistrationContextValue | null>;
export declare function useReferenceAreaRegistration(): ReferenceAreaRegistrationContextValue | null;
