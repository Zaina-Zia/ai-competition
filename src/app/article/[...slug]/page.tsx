'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getArticle } from '@/services/firebase-storage';
import type { StoredArticleData } from '@/services/firebase-storage';
import { Skeleton } from '@/components/ui/skeleton';

export default function ArticlePage() {
  const params = useParams();
  // The slug might be an array if the URL has multiple segments,
  // but we expect it to be the encoded article URL.
  const encodedUrl = Array.isArray(params.slug) ? params.slug.join('/') : params.slug;
  const articleId = encodedUrl; // Use the encoded URL as the ID

  const { data: article, isLoading, error, isError } = useQuery<StoredArticleData, Error>({
    queryKey: ['article', articleId],
    queryFn: () => getArticle(articleId),
    enabled: !!articleId, // Only run query if articleId is available
     staleTime: Infinity, // Assume article content doesn't change often once stored
     refetchOnWindowFocus: false,
  });

  const renderContent = () => {
    if (isLoading) {
      return <ArticleSkeleton />;
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-10 text-destructive">
          <AlertTriangle className="w-12 h-12 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Article</h2>
          <p className="text-muted-foreground mb-4">{error?.message || 'Could not fetch article details.'}</p>
           <Button variant="outline" asChild>
             <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back Home
             </Link>
           </Button>
        </div>
      );
    }

    if (!article) {
      return (
         <div className="flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
             <AlertTriangle className="w-12 h-12 mb-4" />
             <h2 className="text-xl font-semibold mb-2">Article Not Found</h2>
             <p className="mb-4">The requested article could not be found.</p>
             <Button variant="outline" asChild>
               <Link href="/">
                 <ArrowLeft className="mr-2 h-4 w-4" /> Go Back Home
               </Link>
            </Button>
         </div>
      );
    }

    return (
      <>
        <div className="relative w-full h-64 md:h-96 rounded-lg overflow-hidden mb-6 shadow-lg">
          <Image
            src={article.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(article.title)}/800/600`}
            alt={article.title}
            layout="fill"
            objectFit="cover"
             data-ai-hint="news article cover image"
             priority // Prioritize loading the main article image
             onError={(e) => {
                e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(article.title)}/800/600`;
             }}
          />
           <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
           <div className="absolute bottom-0 left-0 p-4 md:p-6">
             <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2 shadow-text">{article.title}</h1>
             <p className="text-sm text-gray-200">{article.source}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Side: Script */}
          <Card className="lg:col-span-1 shadow-md">
            <CardHeader>
              <CardTitle>News Script</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] md:h-[500px] lg:h-[600px] pr-4">
                 {article.generatedScript ? (
                    <p className="text-base whitespace-pre-wrap">{article.generatedScript}</p>
                 ) : (
                    <p className="text-muted-foreground">No script generated for this article.</p>
                 )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Side: Avatar Placeholder & Original Content */}
          <div className="lg:col-span-2 space-y-6">
             <Card className="shadow-md">
               <CardHeader>
                 <CardTitle>Animated Avatar</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="aspect-video bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                   [Placeholder for Animated Avatar]
                 </div>
               </CardContent>
             </Card>

             <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between">
                 <CardTitle>Original Article Content</CardTitle>
                 <Button variant="outline" size="sm" asChild>
                     <a href={decodeURIComponent(articleId)} target="_blank" rel="noopener noreferrer">
                        View Original
                     </a>
                 </Button>
               </CardHeader>
               <CardContent>
                 <ScrollArea className="h-[300px] md:h-[400px] pr-4">
                   <p className="text-base whitespace-pre-wrap">{article.content}</p>
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
      <Button variant="ghost" size="sm" asChild className="mb-4">
         <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
         </Link>
      </Button>
      {renderContent()}
    </div>
  );
}


// Skeleton Loader Component
function ArticleSkeleton() {
  return (
    <>
     <Button variant="ghost" size="sm" className="mb-4 opacity-50 cursor-wait">
         <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
      </Button>
      <Skeleton className="w-full h-64 md:h-96 rounded-lg mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Left Side Skeleton */}
        <Card className="lg:col-span-1 shadow-md">
          <CardHeader>
            <Skeleton className="h-6 w-2/5" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Right Side Skeleton */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-md">
            <CardHeader>
               <Skeleton className="h-6 w-1/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="aspect-video w-full rounded-md" />
            </CardContent>
          </Card>

          <Card className="shadow-md">
             <CardHeader className="flex flex-row items-center justify-between">
               <Skeleton className="h-6 w-2/5" />
                <Skeleton className="h-8 w-24" />
             </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                     <Skeleton className="h-4 w-full" />
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
