'use client';
import Script from 'next/script';
import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from './ui/skeleton'; // Keep Skeleton for loading state
import { AlertTriangle } from 'lucide-react'; // Keep AlertTriangle for error state
import { cn } from '@/lib/utils'; // Keep cn for styling

// No direct import of TalkingHead - relies on import map in layout.tsx

interface AvatarProps {
  textToSpeak: string | null; // Text to be spoken, null when idle
  avatarUrl?: string; // Optional custom avatar URL
  className?: string; // Custom styling
  onReady?: () => void; // Callback when avatar is loaded and ready
  onError?: (error: string) => void; // Callback for errors
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

const Avatar: React.FC<AvatarProps> = ({
  textToSpeak,
  avatarUrl = '/avatars/scene.glb', // Use existing path
  className,
  onReady,
  onError,
  onSpeakStart,
  onSpeakEnd,
}) => {
  const avatarRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any | null>(null); // Store TalkingHead instance
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isMountedRef = useRef(true); // Track mount status

  // --- Initialization Function ---
  const initializeAvatar = async (TalkingHeadClass: any) => {
    // Check refs again inside the async function
    if (!avatarRef.current || !isMountedRef.current) {
        console.warn("Avatar component unmounted or ref missing before initialization completed.");
        return;
    }
    if (headRef.current) {
        console.log("TalkingHead already initialized.");
        if (isMountedRef.current) setIsLoading(false); // Already loaded
        return; // Avoid re-initialization
    }


    console.log('Initializing TalkingHead instance...');
    setError(null); // Clear previous errors on re-init attempt

    try {
      headRef.current = new TalkingHeadClass(avatarRef.current, {
        ttsEndpoint: '/api/tts', // Use iSpeech proxy
        lipsyncModules: ['en'],
        cameraView: 'head', // From example
        cameraDistance: 0.5, // From example
        lightAmbientIntensity: 2, // From example
        lightDirectIntensity: 30, // From example
        modelFPS: 30, // From example
        onerror: (err: Error) => {
          console.error('TalkingHead Runtime Error:', err);
          const errMsg = `TalkingHead runtime error: ${err.message}`;
          if (isMountedRef.current) {
             setError(errMsg);
             onError?.(errMsg);
             setIsLoading(false); // Stop loading on error
             setIsSpeaking(false);
          }
        },
        // Note: `onload` is for the base library, `showAvatar` handles model loading
      });

      console.log(`Loading avatar model from: ${avatarUrl}`);
      await headRef.current.showAvatar({
        url: avatarUrl,
        body: 'F', // Match existing config
        avatarMood: 'neutral', // Initial mood
        ttsLang: 'en-US', // Default TTS lang
        ttsVoice: 'usenglishfemale', // Default TTS voice (matches iSpeech route)
        lipsyncLang: 'en',
      });

      console.log('Avatar loaded successfully.');
      if (isMountedRef.current) {
          setIsLoading(false); // Loading finished
          setError(null); // Clear any previous loading error
          onReady?.();
      }
    } catch (initErr: any) {
      console.error('Failed to initialize TalkingHead or load avatar:', initErr);
      const errMsg = `Initialization/Avatar Load failed: ${initErr?.message || 'Unknown error'}`;
       if (isMountedRef.current) {
            setError(errMsg);
            onError?.(errMsg);
            setIsLoading(false); // Stop loading on error
       }
    }
  };

  // --- Effect for Loading and Initialization ---
  useEffect(() => {
    isMountedRef.current = true; // Component mounted

    const loadAndInit = async () => {
      // Ensure we are in a browser environment
      if (typeof window === 'undefined' || !avatarRef.current) {
        console.warn("Not in a browser environment or avatarRef not ready, skipping TalkingHead initialization.");
        if (isMountedRef.current) setIsLoading(false);
        return;
      }

      console.log("Attempting to dynamically import TalkingHead module ('talkinghead')...");
      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import 'talkinghead'. This relies on the import map in layout.tsx.
        const module = await import('talkinghead');
        const TalkingHead = module?.TalkingHead; // Access the named export

        if (TalkingHead && isMountedRef.current) {
            console.log("TalkingHead module imported successfully via dynamic import.");
            await initializeAvatar(TalkingHead); // Pass the class to the init function
        } else if (isMountedRef.current) {
           throw new Error("TalkingHead module loaded, but 'TalkingHead' class was not found as an export.");
        }
      } catch (importError: any) {
        console.error("Failed to dynamically import or initialize TalkingHead:", importError);
        let errMsg = `Failed to load TalkingHead module: ${importError?.message || 'Unknown import/init error'}.`;
        if (importError.message.includes("Cannot find module 'talkinghead'")) {
             errMsg += ` Check the import map in layout.tsx and ensure the CDN URL is correct and accessible.`;
         } else {
             errMsg += ` Check browser console's Network tab for errors loading the script.`;
         }

        if (isMountedRef.current) {
          setError(errMsg);
          onError?.(errMsg);
          setIsLoading(false);
        }
      }
    };

    loadAndInit();

    // Cleanup function
    return () => {
      isMountedRef.current = false; // Component unmounted
      console.log('Cleaning up Avatar component...');
      if (headRef.current) {
        try {
          // Call the library's cleanup method (stop is not documented, close seems more appropriate)
          headRef.current.close();
          console.log('TalkingHead instance closed.');
        } catch (cleanupError: any) {
          console.error('Error closing TalkingHead:', cleanupError);
        }
      }
      headRef.current = null; // Clear the ref
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl]); // Only re-run if avatarUrl changes, onReady/onError refs shouldn't trigger re-init


  // --- Effect for Speaking ---
  useEffect(() => {
    if (!headRef.current || isLoading || error || isSpeaking) {
      // Don't speak if not ready, already speaking, error state
      return;
    }

    if (textToSpeak) {
        console.log('Avatar attempting to speak:', textToSpeak.substring(0, 50) + '...');
        setIsSpeaking(true);
        setError(null); // Clear previous errors when starting to speak
        onSpeakStart?.(); // Call start callback

        headRef.current.speakText(textToSpeak, { avatarMood: 'neutral' /* Can be dynamic */ })
            .then(() => {
                console.log('Avatar finished speaking.');
                if (isMountedRef.current) {
                    setIsSpeaking(false);
                    onSpeakEnd?.(); // Call end callback on success
                }
            })
            .catch((speakError: any) => {
                console.error('Avatar failed to speak text:', speakError);
                const errMsg = `Speaking error: ${speakError?.message || 'Unknown error'}`;
                if (isMountedRef.current) {
                    setError(errMsg);
                    onError?.(errMsg);
                    setIsSpeaking(false); // Stop speaking state on error
                    onSpeakEnd?.(); // Call end callback even on error
                }
            });
    }
     // If textToSpeak becomes null while speaking, maybe stop? (Optional)
    // else if (isSpeaking && headRef.current?.stop) {
    //     headRef.current.stop(); // If stop method exists
    //     setIsSpeaking(false);
    //     onSpeakEnd?.();
    // }


  }, [textToSpeak, isLoading, error, isSpeaking, onError, onSpeakStart, onSpeakEnd]);


  // --- Render Logic ---
  return (
        <>
           <Script
        id="importmap"
        type="importmap"
        dangerouslySetInnerHTML={{
          __html: `
          {
            "imports": {
              "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
              "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
              "talkinghead": "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.4/modules/talkinghead.mjs"
            }
          }
          `,
        }}
      />

    <div
      ref={avatarRef}
      className={cn(
        'relative w-full aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground overflow-hidden',
        className
      )}
      data-ai-hint="animated talking avatar"
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <Skeleton className="w-3/4 h-3/4 rounded-lg" />
          <p className="absolute bottom-2 text-xs text-muted-foreground animate-pulse">Loading Avatar...</p>
        </div>
      )}
      {error && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 text-destructive p-4 text-center">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm font-semibold">Avatar Error</p>
          <p className="text-xs mt-1 max-w-full break-words">{error}</p>
        </div>
      )}
      {isSpeaking && (
        <div className="absolute bottom-2 left-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded-full animate-pulse backdrop-blur-sm">
          Speaking...
        </div>
      )}
      {!isLoading && !error && !isSpeaking && !textToSpeak && (
         // Placeholder when ready but idle
         <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 text-sm">
            Avatar Ready
         </div>
      )}
      {/* The actual 3D avatar is rendered by TalkingHead into the div referenced by avatarRef */}
    </div>
     </>

  );
};

export default Avatar;
