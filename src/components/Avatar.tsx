// src/components/Avatar.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
// Removed direct import { TalkingHead } from 'talkinghead'; - relying on global from import map
import type { TalkingHead as TalkingHeadType } from '@/types/talkinghead'; // Use types defined in talkinghead.d.ts
import { Skeleton } from './ui/skeleton';
import { AlertTriangle } from 'lucide-react';

interface AvatarProps {
  textToSpeak: string | null; // Text to be spoken, null initially or when not speaking
  avatarUrl?: string; // Optional custom avatar URL
  className?: string; // Allow custom styling
  onReady?: () => void; // Callback when avatar is loaded and ready
  onError?: (error: string) => void; // Callback on error
}

const Avatar: React.FC<AvatarProps> = ({
  textToSpeak,
  avatarUrl = '/avatars/scene.gltf', // Default avatar path
  className,
  onReady,
  onError,
}) => {
  const avatarRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<TalkingHeadType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for retry timeout

  const initializeAvatar = (TalkingHeadClass: typeof TalkingHeadType) => {
      if (!avatarRef.current || headRef.current) return; // Already initialized or no ref

      console.log("Initializing TalkingHead...");
      setIsLoading(true);
      setError(null);

      try {
        const headInstance = new TalkingHeadClass(avatarRef.current, {
          ttsEndpoint: '/api/tts', // Use the Next.js API route proxy
          lipsyncModules: ['en'],
          onerror: (err) => {
            console.error('TalkingHead Error:', err);
            const errMsg = `TalkingHead runtime error: ${err.message}`;
            setError(errMsg);
            onError?.(errMsg); // Notify parent component
            setIsLoading(false);
          },
          onload: () => {
            console.log('TalkingHead base loaded.');
            // Wait for avatar model to load
          }
        });
        headRef.current = headInstance; // Store instance

        console.log(`Loading avatar model from: ${avatarUrl}`);
        headInstance.showAvatar({
          url: avatarUrl,
          body: 'F',
          avatarMood: 'neutral',
          ttsLang: 'en-US', // Default language for iSpeech
          ttsVoice: 'usenglishfemale', // Default voice for iSpeech (check available voices)
          lipsyncLang: 'en',
        }).then(() => {
          console.log('Avatar loaded successfully.');
          setIsLoading(false);
          onReady?.(); // Notify parent component
        }).catch((modelError: any) => {
          console.error('Failed to load avatar model:', modelError);
          const errMsg = `Failed to load avatar model: ${modelError.message || 'Unknown error'}`;
          setError(errMsg);
          onError?.(errMsg);
          setIsLoading(false);
        });

      } catch (initErr: any) {
        console.error('Failed to initialize TalkingHead:', initErr);
        const errMsg = `Initialization failed: ${initErr.message || 'Unknown error'}`;
        setError(errMsg);
        onError?.(errMsg);
        setIsLoading(false);
      }
  };

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component
    const maxRetries = 10;
    let retries = 0;

    const checkAndInit = () => {
        if (typeof window !== 'undefined' && window.TalkingHead) {
            console.log("window.TalkingHead found, initializing...");
            if (isMounted) {
                initializeAvatar(window.TalkingHead);
            }
        } else {
            retries++;
            if (retries <= maxRetries && isMounted) {
                console.log(`TalkingHead not found on window, retrying (${retries}/${maxRetries})...`);
                retryTimeoutRef.current = setTimeout(checkAndInit, 500); // Wait 500ms and retry
            } else if (isMounted) {
                const errMsg = `TalkingHead not available on window object after ${maxRetries} retries. Check the import map script in layout.tsx.`;
                console.error(errMsg);
                setError(errMsg);
                onError?.(errMsg);
                setIsLoading(false);
            }
        }
    };

    checkAndInit(); // Start checking

    // Cleanup function
    return () => {
      isMounted = false; // Mark as unmounted
      if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current); // Clear pending timeout
      }
      console.log('Cleaning up Avatar component...');
      if (headRef.current) {
        try {
          headRef.current.close(); // Ensure close method exists and is called
          console.log('TalkingHead instance closed.');
        } catch (cleanupError) {
          console.error('Error closing TalkingHead:', cleanupError);
        }
      }
       headRef.current = null; // Clear the ref
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl]); // Re-initialize if avatarUrl changes

  // Effect to handle speaking when textToSpeak changes
  useEffect(() => {
    if (headRef.current && textToSpeak && !isSpeaking && !isLoading && !error) {
      console.log('Attempting to speak:', textToSpeak.substring(0, 50) + '...');
      setIsSpeaking(true);
      headRef.current.speakText(textToSpeak)
        .then(() => {
          console.log('Finished speaking.');
          if (typeof window !== 'undefined') { // Check if running in browser
             setIsSpeaking(false);
          }
        })
        .catch((speakError: any) => {
          console.error('Failed to speak text:', speakError);
          const errMsg = `Speaking error: ${speakError.message || 'Unknown error'}`;
           if (typeof window !== 'undefined') { // Check if running in browser
             setError(errMsg);
             onError?.(errMsg);
             setIsSpeaking(false);
           }
        });
    } else if (!textToSpeak && isSpeaking) {
       // Optionally handle stopping speech if text becomes null while speaking
       // headRef.current?.stopSpeaking(); // Requires stopSpeaking method in TalkingHead
       if (typeof window !== 'undefined') { // Check if running in browser
          setIsSpeaking(false); // Assume stopped if text is cleared
       }
    }
  }, [textToSpeak, isLoading, error, isSpeaking, onError]); // Added dependencies


  return (
    <div ref={avatarRef} className={cn("relative w-full aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground overflow-hidden", className)} data-ai-hint="animated talking avatar">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <Skeleton className="w-3/4 h-3/4 rounded-lg" />
        </div>
      )}
      {error && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 text-destructive p-4 text-center">
           <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm font-semibold">Avatar Error</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}
      {/* The TalkingHead library will render the canvas inside this div */}
       {isSpeaking && ( // Visual indicator for speaking state
         <div className="absolute bottom-2 left-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded-full animate-pulse backdrop-blur-sm">
           Speaking...
         </div>
       )}
       {!isLoading && !error && !textToSpeak && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 text-sm">
                Ready to speak
            </div>
        )}
    </div>
  );
};

export default Avatar;
