// src/components/Avatar.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from './ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils'; // Import the cn utility

interface AvatarProps {
  textToSpeak: string | null; // Text to be spoken, null initially or when not speaking
  avatarUrl?: string; // Optional custom avatar URL
  className?: string; // Allow custom styling
  onReady?: () => void; // Callback when avatar is loaded and ready
  onError?: (error: string) => void; // Callback on error
}

const Avatar: React.FC<AvatarProps> = ({
  textToSpeak,
  avatarUrl = '/avatars/scene.gltf', // Ensure this GLTF file exists in public/avatars
  className,
  onReady,
  onError,
}) => {
  const avatarRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any | null>(null); // Use 'any' for TalkingHead instance for now
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const retryCount = useRef(0);
  const maxRetries = 10;
  const retryDelay = 500; // ms

  const initializeAvatar = (TalkingHeadClass: any) => {
    if (!avatarRef.current || headRef.current) return; // Already initialized or no ref

    console.log('Initializing TalkingHead...');
    setError(null); // Clear previous errors

    try {
      const headInstance = new TalkingHeadClass(avatarRef.current, {
        ttsEndpoint: '/api/tts', // Use the Next.js API route proxy
        lipsyncModules: ['en'],
        onerror: (err: Error) => {
          console.error('TalkingHead Runtime Error:', err);
          const errMsg = `TalkingHead runtime error: ${err.message}`;
          setError(errMsg);
          onError?.(errMsg); // Notify parent component
          setIsLoading(false); // Stop loading on runtime error
          setIsSpeaking(false);
        },
        onload: () => {
          console.log('TalkingHead base loaded.');
          // Base loaded, now load the avatar model
        },
      });
      headRef.current = headInstance; // Store instance

      console.log(`Loading avatar model from: ${avatarUrl}`);
      headInstance.showAvatar({
        url: avatarUrl,
        body: 'F', // Example body type
        avatarMood: 'neutral',
        ttsLang: 'en-US', // Default language for iSpeech
        ttsVoice: 'usenglishfemale', // Default voice for iSpeech
        lipsyncLang: 'en',
      }).then(() => {
        console.log('Avatar loaded successfully.');
        setIsLoading(false);
        setError(null); // Clear error on successful load
        onReady?.(); // Notify parent component
      }).catch((modelError: any) => {
        console.error('Failed to load avatar model:', modelError);
        const errMsg = `Failed to load avatar model: ${modelError?.message || 'Unknown model error'}`;
        setError(errMsg);
        onError?.(errMsg);
        setIsLoading(false);
      });

    } catch (initErr: any) {
      console.error('Failed to initialize TalkingHead instance:', initErr);
      const errMsg = `Initialization failed: ${initErr?.message || 'Unknown initialization error'}`;
      setError(errMsg);
      onError?.(errMsg);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    const loadAndInit = async () => {
      // Ensure we are in a browser environment
      if (typeof window === 'undefined' || !avatarRef.current) {
        console.warn("Not in a browser environment or avatarRef not ready, skipping TalkingHead initialization.");
        if (isMounted) setIsLoading(false); // Ensure loading state is cleared
        return;
      }

      console.log("Attempting to dynamically import TalkingHead...");
      setIsLoading(true); // Start loading
      setError(null); // Clear previous errors

      try {
        // Dynamically import TalkingHead. This respects the import map.
        const module = await import('talkinghead');
        const TalkingHead = module?.TalkingHead; // Access the export

        if (TalkingHead && isMounted) {
            console.log("TalkingHead imported successfully via dynamic import.");
            initializeAvatar(TalkingHead);
        } else if (isMounted) {
             // Fallback: Check if import map loaded it onto the window object
             // This might happen if dynamic import fails but the script loaded globally
             console.warn("Dynamic import failed or TalkingHead undefined. Checking window object as fallback.");
             const GlobalTalkingHead = (window as any).TalkingHead;
             if (GlobalTalkingHead) {
                 console.log("TalkingHead found on window object.");
                 initializeAvatar(GlobalTalkingHead);
             } else {
                throw new Error("TalkingHead not found via dynamic import or on window object.");
             }
        }
      } catch (importError: any) {
        console.error("Failed to dynamically import or initialize TalkingHead:", importError);
        const errMsg = `Failed to load TalkingHead module: ${importError?.message || 'Unknown import/init error'}. Check import map and network console.`;
        if (isMounted) {
          setError(errMsg);
          onError?.(errMsg);
          setIsLoading(false);
        }
      }
    };

    loadAndInit(); // Attempt to load and initialize

    // Cleanup function
    return () => {
      isMounted = false; // Mark as unmounted
      console.log('Cleaning up Avatar component...');
      if (headRef.current) {
        try {
          headRef.current.close(); // Ensure close method exists and is called
          console.log('TalkingHead instance closed.');
        } catch (cleanupError: any) {
          console.error('Error closing TalkingHead:', cleanupError);
        }
      }
      headRef.current = null; // Clear the ref
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl]); // Re-initialize if avatarUrl changes

  // Effect to handle speaking when textToSpeak changes
  useEffect(() => {
    if (typeof window === 'undefined' || !headRef.current || isLoading || error) {
      return; // Don't attempt to speak if not ready, loading, errored, or not in browser
    }

    if (textToSpeak && !isSpeaking) {
      console.log('Attempting to speak:', textToSpeak.substring(0, 50) + '...');
      setIsSpeaking(true);
      setError(null); // Clear previous speech errors
      headRef.current.speakText(textToSpeak).then(() => {
        console.log('Finished speaking.');
        if (isSpeaking) setIsSpeaking(false); // Update state only if it was supposed to be speaking
      }).catch((speakError: any) => {
        console.error('Failed to speak text:', speakError);
        const errMsg = `Speaking error: ${speakError?.message || 'Unknown error'}`;
        if (isSpeaking) { // Update state only if it was supposed to be speaking
          setError(errMsg);
          onError?.(errMsg);
          setIsSpeaking(false);
        }
      });
    }
    // Note: No explicit stop logic if textToSpeak becomes null while speaking.
    // TalkingHead might handle this internally, or you might add headRef.current.stop() if available.

  }, [textToSpeak, isLoading, error, isSpeaking, onError]); // Depend on textToSpeak, loading state, error state, and speaking state

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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 text-destructive p-4 text-center ">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm font-semibold">Avatar Error</p>
          {/* Display the detailed error message */}
          <p className="text-xs mt-1 max-w-full break-words">{error}</p>
        </div>
      )}
      {isSpeaking && ( // Visual indicator for speaking state
        <div className="absolute bottom-2 left-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded-full animate-pulse backdrop-blur-sm">
          Speaking...
        </div>
      )}
      {!isLoading && !error && !textToSpeak && !isSpeaking && ( // Show only when ready and idle
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 text-sm">
          Ready to speak
        </div>
      )}
      {/* TalkingHead library renders canvas inside this div */}
    </div>
  );
};

export default Avatar;
