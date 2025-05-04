
'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getArticle } from '@/services/firebase-storage';
import type { StoredArticleData } from '@/services/firebase-storage';
import { Skeleton } from '@/components/ui/skeleton';
import { decodeBase64UrlSafe } from '@/lib/utils'; // Import the helper function

export default function ArticlePage() {
  const params = useParams();
  // The slug is the URL-safe Base64 encoded article URL.
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug; // Assuming single segment slug

   // Decode the slug to get the article ID used in storage (which is the encoded URL)
   const articleId = slug;
   // We still need the original URL for display/linking. Decode it using the helper.
   let originalUrl: string | undefined;
   if (slug) {
     try {
       originalUrl = decodeBase64UrlSafe(slug);
     } catch (error) {
       console.error("Error decoding slug:", slug, error);
       // Handle potential decoding errors, maybe redirect or show an error state
     }
   }


  const { data: article, isLoading, error, isError } = useQuery<StoredArticleData, Error>({
    // Use the **encoded slug** (articleId) as the query key parameter, as that's what getArticle expects
    queryKey: ['article', articleId],
    queryFn: () => {
        if (!articleId) {
            // Should not happen if route matching works, but defensively handle
            return Promise.reject(new Error('Article ID (slug) is missing'));
        }
        // Pass the encoded slug (which is the storage ID) to getArticle
        return getArticle(articleId);
    },
    enabled: !!articleId, // Only run query if slug is available
    staleTime: 60 * 60 * 1000, // Cache article data for 1 hour
    refetchOnWindowFocus: false, // Don't refetch on focus, content is static once stored
  });

  const renderContent = () => {
    if (isLoading) {
      return <ArticleSkeleton />;
    }

    if (isError || !article) { // Combine error and not found state
      return (
        <div className="flex flex-col items-center justify-center text-center py-10 text-destructive">
          <AlertTriangle className="w-12 h-12 mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {isError ? 'Error Loading Article' : 'Article Not Found'}
          </h2>
          <p className="text-muted-foreground mb-4 max-w-md px-4">
              {isError
                  ? error?.message || 'Could not fetch article details. It might have been moved or deleted.'
                  : 'The requested article could not be found in our system.'}
              {/* Add a specific hint for decoding errors */}
               {!originalUrl && slug && <span className="block mt-2">Could not decode the article identifier from the URL.</span>}
          </p>
           <Button variant="outline" asChild>
             <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back Home
             </Link>
           </Button>
        </div>
      );
    }


    // Use the decoded originalUrl for the "View Original" link
    const decodedOriginalUrl = originalUrl || '#'; // Fallback if decoding failed


    return (
      <>
        {/* Hero Image and Title */}
        <div className="relative w-full h-64 md:h-80 lg:h-96 rounded-lg overflow-hidden mb-6 shadow-lg bg-muted">
           {article.imageUrl ? (
               <Image
                  src={article.imageUrl}
                  alt={article.title}
                  layout="fill"
                  objectFit="cover"
                  data-ai-hint="news article cover image"
                  priority // Prioritize loading the main article image
                  onError={(e) => {
                      // More robust fallback
                      e.currentTarget.style.display = 'none'; // Hide broken image
                      // Optional: Show a placeholder div or icon instead
                  }}
               />
            ) : (
                // Placeholder if no image URL
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
          {/* Left Side: Generated Script */}
          <Card className="lg:col-span-1 shadow-md border-border">
            <CardHeader>
              <CardTitle className="text-lg">AI Generated News Script</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] md:h-[500px] lg:h-[calc(100vh-24rem)] pr-3"> {/* Adjusted height */}
                 {article.generatedScript ? (
                    // Using whitespace-pre-wrap to respect newlines from the script
                    <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed font-mono">{article.generatedScript}</p>
                 ) : (
                    <p className="text-muted-foreground italic">No script was generated for this article.</p>
                 )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Side: Avatar Placeholder & Original Content */}
          <div className="lg:col-span-2 space-y-6">
             {/* Placeholder for future Avatar component */}
             <Card className="shadow-md border-border">
               <CardHeader>
                 <CardTitle className="text-lg">Animated Avatar (Coming Soon)</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                   [Video Placeholder]
                 </div>
               </CardContent>
             </Card>

             {/* Original Article Content */}
             <Card className="shadow-md border-border">
               <CardHeader className="flex flex-row items-center justify-between space-x-4">
                 <CardTitle className="text-lg">Original Article Summary</CardTitle>
                  {/* Link to the original article URL, only if successfully decoded */}
                  {decodedOriginalUrl !== '#' && (
                      <Button variant="outline" size="sm" asChild>
                          <a href={decodedOriginalUrl} target="_blank" rel="noopener noreferrer" title="Opens original article in new tab">
                              View Original <ExternalLink className="ml-2 h-4 w-4"/>
                          </a>
                      </Button>
                  )}
               </CardHeader>
               <CardContent>
                 <ScrollArea className="h-[300px] md:h-[400px] pr-3">
                   {/* Display the stored content (which might be summary or full) */}
                   <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed">{article.content || 'Original content not available.'}</p>
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
       {/* Back Button */}
      <Button variant="ghost" size="sm" asChild className="mb-4 text-muted-foreground hover:text-foreground">
         <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
         </Link>
      </Button>
      {/* Render main content or loading/error states */}
      {renderContent()}
    </div>
  );
}


// --- Skeleton Loader Component ---
function ArticleSkeleton() {
  return (
    <>
     {/* Skeleton for Back Button */}
     <Skeleton className="h-9 w-32 mb-4" />
     {/* Skeleton for Hero */}
      <Skeleton className="w-full h-64 md:h-80 lg:h-96 rounded-lg mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Left Side Skeleton (Script) */}
        <Card className="lg:col-span-1 shadow-md border-border">
          <CardHeader>
            <Skeleton className="h-6 w-3/5" /> {/* Title skeleton */}
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
               <Skeleton className="h-6 w-1/2" /> {/* Title skeleton */}
            </CardHeader>
            <CardContent>
              <Skeleton className="aspect-video w-full rounded-md" />
            </CardContent>
          </Card>

           {/* Original Content Skeleton */}
          <Card className="shadow-md border-border">
             <CardHeader className="flex flex-row items-center justify-between">
               <Skeleton className="h-6 w-2/5" /> {/* Title skeleton */}
                <Skeleton className="h-9 w-28" /> {/* Button skeleton */}
             </CardHeader>
            <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                 <Skeleton className="h-4 w-full" />
                 <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
