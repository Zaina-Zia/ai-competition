// Basic type definitions for TalkingHead library loaded via import map/CDN
// These might need refinement based on actual library usage and structure.

type Viseme = {
    time: number;
    value: string | number; // Value can be string (ARKit) or number (Oculus)
};

type TalkingHeadOptions = {
    ttsEndpoint?: string; // URL for custom Text-to-Speech endpoint
    ttsApikey?: string; // Optional API key for TTS endpoint
    lipsyncModules?: string[]; // Array of supported languages for lipsync (e.g., ['en', 'es'])
    onload?: () => void; // Callback when TalkingHead is ready
    onerror?: (error: Error) => void; // Callback for errors
    cameraView?: 'head' | 'upperBody' | 'fullBody';
    audio?: { volume?: number };
};

type AvatarConfig = {
    url: string; // URL to the GLB/GLTF model
    body?: 'M' | 'F'; // Body type
    avatarMood?: string; // Initial mood (e.g., 'neutral', 'happy')
    ttsLang?: string; // Language code for TTS (e.g., 'en-US')
    ttsVoice?: string; // Specific voice for TTS
    lipsyncLang?: string; // Language for lip-sync model
};

type SpeakConfig = {
    visemes?: Viseme[]; // Optional pre-calculated visemes
};

declare class TalkingHead {
    constructor(container: HTMLElement | null, options?: TalkingHeadOptions);
    showAvatar(config: AvatarConfig): Promise<void>;
    speakText(text: string, config?: SpeakConfig): Promise<void>;
    setAvatarMood(mood: string, intensity?: number): void;
    close(): void; // Method to clean up resources
    // Add other methods based on library documentation if needed
    // e.g., playAnimation, setCameraView, etc.
}

// Allow dynamic import of the module name specified in the import map
declare module 'talkinghead' {
    export { TalkingHead };
}

// Make TalkingHead available on the window object if loaded globally by older scripts/setups
// This is less ideal than module imports but provides a fallback.
interface Window {
    TalkingHead?: typeof TalkingHead;
}