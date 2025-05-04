// src/components/Avatar.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { TalkingHead } from 'talkinghead'; // Use types defined in talkinghead.d.ts
import { Skeleton } from './ui/skeleton';
import { AlertTriangle } from 'lucide-react';

interface AvatarProps {
  textToSpeak: string | null; // Text to be spoken, null initially or when not speaking
  avatarUrl?: string; // Optional custom avatar URL
  className?: string; // Allow custom styling
}

const Avatar: React.FC<AvatarProps> = ({
  textToSpeak,
  avatarUrl = '/avatars/brunette.glb', // Default avatar
  className,
}) => {
  const avatarRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<TalkingHead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    let headInstance: TalkingHead | null = null;
    let isMounted = true; // Flag to prevent state updates on unmounted component

    const initializeAvatar = async () => {
      if (!avatarRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import TalkingHead client-side
        const { TalkingHead } = await import('talkinghead');
        headInstance = new TalkingHead(avatarRef.current, {
          ttsEndpoint: '/api/tts',
          lipsyncModules: ['en'],
          onerror: (err) => {
            console.error('TalkingHead Error:', err);
             if (isMounted) setError(`TalkingHead initialization failed: ${err.message}`);
          },
           onload: () => console.log('TalkingHead loaded'), // Log successful load
        });
        headRef.current = headInstance; // Store instance

        console.log(`Loading avatar from: ${avatarUrl}`);
        await headInstance.showAvatar({
          url: avatarUrl,
          body: 'F',
          avatarMood: 'neutral',
          ttsLang: 'en-US', // Default language
          ttsVoice: 'en-US-Standard-C', // Default voice (check iSpeech for options)
          lipsyncLang: 'en',
        });

        if (isMounted) setIsLoading(false);
        console.log('Avatar loaded successfully.');

      } catch (err: any) {
        console.error('Failed to initialize TalkingHead or load avatar:', err);
        if (isMounted) {
          setError(`Initialization failed: ${err.message || 'Unknown error'}`);
          setIsLoading(false);
        }
      }
    };

    initializeAvatar();

    // Cleanup function
    return () => {
      isMounted = false; // Mark as unmounted
      console.log('Cleaning up Avatar component...');
      if (headInstance) {
        try {
          headInstance.close(); // Ensure close method exists and is called
          console.log('TalkingHead instance closed.');
        } catch (cleanupError) {
          console.error('Error closing TalkingHead:', cleanupError);
        }
      }
       headRef.current = null; // Clear the ref
    };
  }, [avatarUrl]); // Re-initialize if avatarUrl changes

  // Effect to handle speaking when textToSpeak changes
  useEffect(() => {
    if (headRef.current && textToSpeak && !isSpeaking) {
      console.log('Attempting to speak:', textToSpeak.substring(0, 50) + '...');
      setIsSpeaking(true);
      headRef.current.speakText(textToSpeak)
        .then(() => {
          console.log('Finished speaking.');
          setIsSpeaking(false);
        })
        .catch((speakError: any) => {
          console.error('Failed to speak text:', speakError);
          setError(`Speaking error: ${speakError.message || 'Unknown error'}`);
          setIsSpeaking(false);
        });
    } else if (!textToSpeak && isSpeaking) {
       // Optionally handle stopping speech if text becomes null while speaking
       // headRef.current?.stopSpeaking(); // Requires stopSpeaking method in TalkingHead
       setIsSpeaking(false); // Assume stopped if text is cleared
    }
  }, [textToSpeak]); // Depend only on textToSpeak for speaking actions


  return (
    <div ref={avatarRef} className={className || "relative w-full aspect-square"} data-ai-hint="animated talking avatar">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Skeleton className="w-3/4 h-3/4 rounded-full" />
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
         <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
           Speaking...
         </div>
       )}
    </div>
  );
};

export default Avatar;