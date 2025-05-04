// src/app/article/[...slug]/page.tsx
'use client';

import React, { useState } from 'react'; // Added useState
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, AlertTriangle, ExternalLink, PlayCircle } from 'lucide-react'; // Added PlayCircle
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getArticle } from '@/services/firebase-storage';
import type { StoredArticleData } from '@/services/firebase-storage';
import { Skeleton } from '@/components/ui/skeleton';
import { decodeBase64UrlSafe } from '@/lib/utils';
import Avatar from '@/components/Avatar'; // Import the Avatar component
import { useToast } from '@/hooks/use-toast'; // Import useToast

// Constants
const CONTENT_DISPLAY_THRESHOLD = 2000;

export default function ArticlePage() {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [textToSpeak, setTextToSpeak] = useState<string | null>(null); // State to control text for Avatar
  const { toast } = useToast(); // Initialize toast

   // Decode the slug to get the article ID (encoded URL)
   const articleId = slug;
   let originalUrl: string | undefined;
   if (slug) {
     try {
       originalUrl = decodeBase64UrlSafe(slug);
     } catch (error) {
       console.error("Error decoding slug:", slug, error);
       // Handle decoding errors if necessary
     }
   }

  const { data: article, isLoading, error, isError } = useQuery<StoredArticleData, Error>({
    queryKey: ['article', articleId],
    queryFn: () => {
        if (!articleId) return Promise.reject(new Error('Article ID (slug) is missing'));
        return getArticle(articleId);
    },
    enabled: !!articleId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

   // Function to trigger speaking
   const handleSpeak = () => {
       if (isLoading || !article?.generatedScript) {
           toast({
               variant: "destructive",
               title: "Cannot Speak",
               description: isLoading ? "Article data is still loading." : "No generated script available to speak.",
           });
           return;
       }
       console.log("Setting text to speak:", article.generatedScript.substring(0, 50) + '...');
       setTextToSpeak(article.generatedScript); // Set the script content to be spoken
   };

  const renderContent = () => {
    if (isLoading) return <ArticleSkeleton />;

    if (isError || !article) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-10 text-destructive">
          <AlertTriangle className="w-12 h-12 mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {isError ? 'Error Loading Article' : 'Article Not Found'}
          </h2>
          <p className="text-muted-foreground mb-4 max-w-md px-4">
              {isError ? error?.message || 'Could not fetch article details.' : 'Article could not be found.'}
              {!originalUrl && slug && <span className="block mt-2">Could not decode the article identifier.</span>}
          </p>
           <Button variant="outline" asChild>
             <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back Home
             </Link>
           </Button>
        </div>
      );
    }

    const decodedOriginalUrl = originalUrl || '#';
    const displaySummaryFirst = article.summary && article.content.length > CONTENT_DISPLAY_THRESHOLD;
    const initialContentDisplay = displaySummaryFirst ? article.summary : article.content;
    const fullContentAvailable = article.content && article.content.length > (article.summary?.length || 0);

    return (
      <>
        {/* Hero Image and Title */}
        <div className="relative w-full h-64 md:h-80 lg:h-96 rounded-lg overflow-hidden mb-6 shadow-lg bg-muted">
           {article.imageUrl ? (
               <Image
                  src={article.imageUrl}
                  alt={article.title}
                  fill // Use fill instead of layout="fill" in Next.js 13+
                  style={{ objectFit: 'cover' }} // Use style for objectFit
                  data-ai-hint="news article cover image"
                  priority
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
               />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-secondary">
                    <span className="text-muted-foreground text-sm">No image available</span>
                </div>
            )}
           <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent"></div>
           <div className="absolute bottom-0 left-0 p-4 md:p-6 w-full">
             <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white mb-1 shadow-text">{article.title}</h1>
             <p className="text-sm text-gray-200">{article.source} {article.publishedDate && `- ${article.publishedDate}`}</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Side: Generated Script & Speak Button */}
          <Card className="lg:col-span-1 shadow-md border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">AI Generated News Script</CardTitle>
               <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSpeak}
                    disabled={!article.generatedScript || isLoading || textToSpeak !== null} // Disable if no script, loading, or already speaking/set to speak
                    title="Read script aloud"
                  >
                   <PlayCircle className="h-5 w-5" />
                   <span className="sr-only">Read script</span>
               </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] md:h-[500px] lg:h-[calc(100vh-30rem)] pr-3"> {/* Adjusted height */}
                 {article.generatedScript ? (
                    <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed font-mono">{article.generatedScript}</p>
                 ) : (
                    <p className="text-muted-foreground italic">No script was generated.</p>
                 )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Side: Avatar & Original Content */}
          <div className="lg:col-span-2 space-y-6">
             {/* Avatar Component */}
             <Card className="shadow-md border-border">
               <CardHeader>
                 <CardTitle className="text-lg">Animated Avatar</CardTitle>
               </CardHeader>
               <CardContent>
                 {/* Render the Avatar, passing the text to speak */}
                 <Avatar
                    textToSpeak={textToSpeak}
                    className="relative w-full aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground overflow-hidden" // Use aspect-video for consistent size
                 />
               </CardContent>
             </Card>

             {/* Original Article Content */}
             <Card className="shadow-md border-border">
               <CardHeader className="flex flex-row items-center justify-between space-x-4">
                 <div>
                     <CardTitle className="text-lg">Original Article</CardTitle>
                     {displaySummaryFirst && fullContentAvailable && (
                        <CardDescription className="text-xs text-muted-foreground mt-1">Showing summary. Full content below.</CardDescription>
                     )}
                     {!article.content && !article.summary && (
                        <CardDescription className="text-xs text-muted-foreground mt-1">Content not available.</CardDescription>
                     )}
                 </div>
                  {decodedOriginalUrl !== '#' && (
                      <Button variant="outline" size="sm" asChild>
                          <a href={decodedOriginalUrl} target="_blank" rel="noopener noreferrer" title="Opens original article">
                              View Original <ExternalLink className="ml-2 h-4 w-4"/>
                          </a>
                      </Button>
                  )}
               </CardHeader>
               <CardContent>
                 <ScrollArea className="h-[300px] md:h-[400px] pr-3">
                   <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed mb-4">
                     {initialContentDisplay || 'Content not available.'}
                   </p>
                   {displaySummaryFirst && fullContentAvailable && (
                       <>
                           <hr className="my-4 border-border" />
                           <h3 className="text-md font-semibold mb-2">Full Content:</h3>
                           <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed">
                               {article.content}
                           </p>
                       </>
                   )}
                 </ScrollArea>
               </CardContent>
             </Card>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <Button variant="ghost" size="sm" asChild className="mb-4 text-muted-foreground hover:text-foreground">
         <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
         </Link>
      </Button>
      {renderContent()}
    </div>
  );
}

// --- Skeleton Loader Component ---
function ArticleSkeleton() {
  return (
    <>
     <Skeleton className="h-9 w-32 mb-4" />
      <Skeleton className="w-full h-64 md:h-80 lg:h-96 rounded-lg mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Left Side Skeleton (Script) */}
        <Card className="lg:col-span-1 shadow-md border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-9 w-9 rounded-full" /> {/* Skeleton for Play Button */}
          </CardHeader>
          <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-full" />
               <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>

        {/* Right Side Skeleton (Avatar & Content) */}
        <div className="lg:col-span-2 space-y-6">
           {/* Avatar Placeholder Skeleton */}
          <Card className="shadow-md border-border">
            <CardHeader>
               <Skeleton className="h-6 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="aspect-video w-full rounded-md" />
            </CardContent>
          </Card>

           {/* Original Content Skeleton */}
          <Card className="shadow-md border-border">
             <CardHeader className="flex flex-row items-center justify-between">
               <Skeleton className="h-6 w-2/5" />
                <Skeleton className="h-9 w-28" />
             </CardHeader>
            <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                 <Skeleton className="h-4 w-full" />
                 <Skeleton className="h-4 w-3/4" />
                 <Skeleton className="h-4 w-full" />
                 <Skeleton className="h-4 w-4/5" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}