'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from './ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Make sure src/types/talkinghead.d.ts exists and declares the 'talkinghead' module
// Example:
// declare module 'talkinghead' {
//   export class TalkingHead { /* ... methods ... */ }
// }

interface AvatarProps {
  textToSpeak: string | null; // Text to be spoken, null when idle
  avatarUrl?: string; // Optional custom avatar URL
  className?: string; // Custom styling
  onReady?: () => void; // Callback when avatar is loaded
  onError?: (error: string) => void; // Callback for errors
}

const Avatar: React.FC<AvatarProps> = ({
  textToSpeak,
  avatarUrl = '/avatars/scene.glb', // Ensure this exists in public/avatars
  className,
  onReady,
  onError,
}) => {
  const avatarRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any | null>(null); // Use 'any' if TalkingHead type isn't fully defined
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isMountedRef = useRef(true); // Track mount status for async operations

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
        ttsEndpoint: '/api/tts', // Ensure this API route exists and works
        lipsyncModules: ['en'], // Supported languages for lip-sync
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
        onload: () => {
          console.log('TalkingHead base instance loaded.');
          // Avatar loading is now separate
        },
      });

      console.log(`Loading avatar model from: ${avatarUrl}`);
      await headRef.current.showAvatar({
        url: avatarUrl,
        body: 'F',
        avatarMood: 'neutral',
        ttsLang: 'en-US',
        ttsVoice: 'usenglishfemale', // Default from your spec
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
        // Dynamically import 'talkinghead'. This relies on the import map pointing correctly.
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
        // Log the specific import map error if possible
        let errMsg = `Failed to load TalkingHead module: ${importError?.message || 'Unknown import/init error'}.`;
        if (importError.message.includes("Cannot find module 'talkinghead'")) {
            errMsg += ` Check the import map in layout.tsx and ensure '/talkinghead/talkinghead.mjs' is accessible.`;
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
          // Attempt to stop any ongoing speech or processes
          // headRef.current.stopSpeaking?.(); // If such a method exists
          headRef.current.close(); // Call the library's cleanup method
          console.log('TalkingHead instance closed.');
        } catch (cleanupError: any) {
          console.error('Error closing TalkingHead:', cleanupError);
        }
      }
      headRef.current = null; // Clear the ref
    };
  }, [avatarUrl, onReady, onError]); // Rerun if avatarUrl changes


  // --- Effect for Speaking ---
  useEffect(() => {
    if (!headRef.current || isLoading || error || !textToSpeak || isSpeaking) {
      // Don't speak if not ready, already speaking, error state, or no text
      return;
    }

    console.log('Avatar attempting to speak:', textToSpeak.substring(0, 50) + '...');
    setIsSpeaking(true);
    setError(null); // Clear previous errors when starting to speak

    headRef.current.speakText(textToSpeak).then(() => {
      console.log('Avatar finished speaking.');
      if (isMountedRef.current) {
         setIsSpeaking(false);
      }
    }).catch((speakError: any) => {
      console.error('Avatar failed to speak text:', speakError);
      const errMsg = `Speaking error: ${speakError?.message || 'Unknown error'}`;
      if (isMountedRef.current) {
         setError(errMsg);
         onError?.(errMsg);
         setIsSpeaking(false); // Stop speaking state on error
      }
    });

    // Note: No cleanup needed specifically for this effect,
    // as the main cleanup handles the TalkingHead instance.

  }, [textToSpeak, isLoading, error, isSpeaking, onError]); // Dependencies for the speaking effect


  // --- Render Logic ---
  return (
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
      {!isLoading && !error && !textToSpeak && !isSpeaking && (
         // Display a placeholder or the avatar's idle state when ready but not speaking
         // The actual avatar should be rendered by TalkingHead onto the div referenced by avatarRef
         <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 text-sm">
            Avatar Ready
         </div>
      )}
    </div>
  );
};

export default Avatar;
