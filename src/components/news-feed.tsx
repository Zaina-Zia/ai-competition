'use client';

import type { ChangeEvent, FormEvent } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu, // Added import
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { scrapeAndStoreArticles } from '@/actions/scrape-actions'; // Import Server Action
import { getAllStoredArticles } from '@/services/firebase-storage'; // Import fetch function
import type { StoredArticleData } from '@/services/firebase-storage'; // Interface for stored data (includes script)
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { encodeBase64UrlSafe } from '@/lib/utils'; // Import the helper function


// Define available news sources
const NEWS_SOURCES = ['BBC', 'Reuters', 'CNN', 'Fox News', 'NPR', 'The Guardian', 'New York Times', 'Al Jazeera']; // Added more sources based on config
const ARTICLES_PER_SOURCE_LIMIT = 10; // Limit for scraping per source

export function NewsFeed() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(NEWS_SOURCES); // Default to all sources selected
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch *stored* articles from Firebase Storage using React Query
  const {
    data: allArticles = [],
    isLoading: isLoadingArticles,
    isFetching: isFetchingArticles, // Track refetching state
    error: articlesError,
    isError: isArticlesError, // Explicit boolean for error state
  } = useQuery<StoredArticleData[], Error>({
    queryKey: ['storedArticles'], // Unique query key for stored articles
    queryFn: async () => {
       console.log('Fetching stored articles from Firebase Storage...');
       try {
         // This function now fetches all JSONs and parses them
         const articles = await getAllStoredArticles();
         console.log(`Fetched ${articles.length} stored articles.`);
         // Sort articles by stored date (newest first) if available, fallback to title
         articles.sort((a, b) => {
            if (a.storedAt && b.storedAt) {
                return new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime();
            }
             if (a.publishedDate && b.publishedDate) {
                 // Basic date parsing attempt (might need refinement)
                 try {
                     return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
                 } catch { /* ignore parsing errors */ }
             }
             // Fallback sort by title if dates are unavailable or invalid
             return (b.title || '').localeCompare(a.title || '');
         });
         return articles;
       } catch (err) {
         console.error('Error fetching stored articles:', err);
         toast({
           variant: "destructive",
           title: 'Error Loading Articles',
           description: (err as Error).message || 'Could not fetch stored articles. Check console for details.',
         });
         throw err; // Re-throw the error for React Query
       }
    },
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes
    refetchInterval: 15 * 60 * 1000, // Optionally refetch every 15 minutes
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

   // Mutation for triggering the scraping Server Action
  const scrapeMutation = useMutation({
    mutationFn: async (sources: string[]) => {
       toast({ title: `Initiating scraping for ${sources.length} source(s)...`, description: sources.join(', ') });
       // Call the Server Action
       return await scrapeAndStoreArticles(sources, ARTICLES_PER_SOURCE_LIMIT, 5); // Use defined limit and concurrency
    },
    onSuccess: (result) => {
       if (result.success) {
           toast({
               title: 'Scraping Complete',
               description: `Processed ${result.processedCount} new articles from ${result.sourcesAttempted} sources. Scraped total: ${result.articlesScraped}.`
            });
       } else {
           toast({
               variant: "destructive",
               title: 'Scraping Issues Encountered',
               description: `Processed ${result.processedCount} / Scraped ${result.articlesScraped}. Errors: ${result.errors.length}. Check logs for details.`,
               duration: 10000 // Show longer for errors
           });
           console.error("Scraping errors:", result.errors);
       }
        // Invalidate and refetch the stored articles query to show new/updated data regardless of partial success
       queryClient.invalidateQueries({ queryKey: ['storedArticles'] });
    },
    onError: (error) => {
       toast({
         variant: "destructive",
         title: 'Scraping Request Failed',
         description: (error as Error).message || 'An unexpected error occurred initiating the scrape.',
         duration: 10000
       });
       console.error("Scrape mutation error:", error);
    }
  });


  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value.toLowerCase()); // Normalize search term
  };

  const handleSourceChange = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const handleSelectAllSources = (checked: boolean) => {
    setSelectedSources(checked ? NEWS_SOURCES : []);
  };

   const handleScrapeLatest = () => {
    if (scrapeMutation.isPending) return; // Prevent multiple concurrent scrapes

    if (!selectedSources.length) {
      toast({
        variant: "destructive",
        title: 'No Sources Selected',
        description: 'Please select at least one news source to scrape.',
      });
      return;
    }
    // Call the mutation with the currently selected sources
    scrapeMutation.mutate(selectedSources);
  };


  // Filter articles based on search term and selected sources
  const filteredArticles = useMemo(() => {
    return allArticles.filter((article) => {
        const sourceMatch = selectedSources.length === 0 || selectedSources.includes(article.source);
        // Include summary in search check
        const termMatch = searchTerm === '' ||
                          (article.title || '').toLowerCase().includes(searchTerm) ||
                          (article.content && article.content.toLowerCase().includes(searchTerm)) ||
                          (article.summary && article.summary.toLowerCase().includes(searchTerm)) ||
                          (article.generatedScript && article.generatedScript.toLowerCase().includes(searchTerm));
        return sourceMatch && termMatch;
    });
    // Sorting is now handled within the useQuery's queryFn after fetching
  }, [allArticles, selectedSources, searchTerm]);


   // Combine loading states
   const isLoading = isLoadingArticles || scrapeMutation.isPending;
   const isFetching = isFetchingArticles || scrapeMutation.isPending; // Use this for refresh indicators


  return (
    <SidebarProvider>
      {/* Sidebar for Source Selection */}
      <Sidebar side="left">
        <SidebarHeader>
           <div className="flex items-center justify-between p-2">
             <h2 className="text-lg font-semibold text-sidebar-foreground">News Sources</h2>
             {/* Mobile trigger */}
             <SidebarTrigger className="md:hidden text-sidebar-foreground hover:bg-sidebar-accent"/>
           </div>
        </SidebarHeader>
        <SidebarContent>
           <ScrollArea className="h-[calc(100vh-150px)] px-2"> {/* Adjust height as needed */}
            <div className="space-y-1 p-1">
               {/* Select/Deselect All */}
               <div className="flex items-center space-x-2 p-2 rounded-md hover:bg-sidebar-accent">
                  <Checkbox
                     id="select-all"
                     checked={selectedSources.length === NEWS_SOURCES.length && NEWS_SOURCES.length > 0}
                     onCheckedChange={(checked) => handleSelectAllSources(Boolean(checked))}
                     className="border-sidebar-accent data-[state=checked]:bg-sidebar-primary data-[state=checked]:text-sidebar-primary-foreground"
                  />
                  <Label htmlFor="select-all" className="font-medium text-sidebar-foreground cursor-pointer flex-grow">Select All</Label>
               </div>
                {/* Source List */}
               {NEWS_SOURCES.map((source) => (
               <div key={source} className="flex items-center space-x-2 p-2 rounded-md hover:bg-sidebar-accent">
                  <Checkbox
                     id={source}
                     checked={selectedSources.includes(source)}
                     onCheckedChange={() => handleSourceChange(source)}
                     className="border-sidebar-accent data-[state=checked]:bg-sidebar-primary data-[state=checked]:text-sidebar-primary-foreground"
                  />
                  <Label htmlFor={source} className="w-full cursor-pointer text-sidebar-foreground">{source}</Label>
               </div>
               ))}
            </div>
          </ScrollArea>
        </SidebarContent>
         {/* Button to trigger scraping */}
         <SidebarFooter className="p-2 border-t border-sidebar-border">
             <Button
                onClick={handleScrapeLatest}
                disabled={isFetching} // Disable while scraping or fetching
                className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
             >
                {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {scrapeMutation.isPending ? 'Scraping...' : (isFetchingArticles ? 'Refreshing...' : 'Scrape Latest')}
             </Button>
         </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset>
        <div className="p-4 md:p-6">
          {/* Header with Title and Search */}
          <header className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
             <div className="flex items-center gap-2">
                {/* Desktop trigger */}
                <Button variant="ghost" size="icon" className="hidden md:flex text-foreground hover:bg-accent" asChild>
                    <SidebarTrigger />
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">NewsCast Now</h1>
            </div>
            {/* Search Input */}
            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search articles..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 w-full md:w-64 lg:w-80 bg-card border-input text-foreground placeholder:text-muted-foreground focus:ring-accent"
              />
            </div>
          </header>

          {/* Loading State */}
          {isLoadingArticles && !allArticles.length && ( // Show skeleton only on initial load
             <FeedSkeleton />
           )}

            {/* Error State */}
            {isArticlesError && (
              <div className="flex flex-col items-center justify-center text-center py-10 text-destructive bg-destructive/10 rounded-lg border border-destructive">
                 <AlertTriangle className="w-12 h-12 mb-4" />
                 <h2 className="text-xl font-semibold mb-2">Error Loading News Feed</h2>
                 <p className="text-muted-foreground mb-4 max-w-md px-4">
                    {articlesError?.message || 'Could not fetch the news feed. Please try again later or attempt to scrape latest content.'}
                 </p>
                 {/* Provide a way to retry fetching */}
                 <Button variant="destructive" onClick={() => queryClient.refetchQueries({ queryKey: ['storedArticles'] })} disabled={isFetching}>
                    {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Retry Loading Feed'}
                 </Button>
              </div>
            )}

          {/* Empty State (after load/filter) */}
          {!isLoadingArticles && !isArticlesError && filteredArticles.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
               <Filter className="mx-auto h-12 w-12 mb-4 text-muted-foreground/50"/>
              <p className="text-lg font-semibold">No articles found matching your criteria.</p>
              <p>Try adjusting the search or source filters, or</p>
               <Button variant="link" className="px-1" onClick={handleScrapeLatest} disabled={isFetching}>
                    {isFetching ? 'Scraping...' : 'scrape the latest content'}
               </Button>.
            </div>
          )}

          {/* Article Grid */}
          {!isArticlesError && filteredArticles.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {filteredArticles.map((article) => {
                 // Use URL-safe Base64 encoding for the ID
                 const articleId = encodeBase64UrlSafe(article.url);
                 // Use URL-safe Base64 encoding of the title for image seed
                 const imageSeed = encodeBase64UrlSafe(article.title || 'fallback-title');
                 // Determine content to display in the card preview
                 const previewContent = article.summary || article.content; // Prefer summary, fallback to content
                 const previewText = article.generatedScript
                                    ? `Script: ${article.generatedScript}`
                                    : previewContent;

                 return (
                    <Card key={articleId} className="overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300 ease-in-out bg-card text-card-foreground border-border group flex flex-col">
                      <Link href={`/article/${articleId}`} passHref legacyBehavior>
                        <a className="block flex flex-col flex-grow">
                           {/* Image */}
                           <div className="relative h-40 w-full overflow-hidden">
                             <Image
                               src={article.imageUrl || `https://picsum.photos/seed/${imageSeed}/400/300`} // Use encoded title for seed
                               alt={article.title || 'Article image'} // Add fallback alt text
                               layout="fill"
                               objectFit="cover"
                               data-ai-hint="news article technology business world politics" // Hints for potential future image replacement
                               onError={(e) => {
                                  // Fallback if image fails to load
                                  e.currentTarget.src = `https://picsum.photos/seed/${imageSeed}/400/300`
                               }}
                               className="transition-transform duration-300 group-hover:scale-105"
                             />
                           </div>
                           {/* Content */}
                           <div className="p-4 flex flex-col flex-grow">
                              <CardTitle className="text-base font-semibold leading-snug line-clamp-2 mb-1 group-hover:text-accent transition-colors">
                                  {article.title || 'Untitled Article'} {/* Add fallback title */}
                               </CardTitle>
                              <p className="text-xs text-muted-foreground mb-2">{article.source} {article.publishedDate && `- ${article.publishedDate}`}</p>
                              {/* Show preview text (script > summary > content) */}
                              <p className="text-sm text-muted-foreground line-clamp-3 flex-grow">
                                  {previewText ? `${previewText.substring(0, 150)}...` : 'Content not available.'}
                               </p>
                           </div>
                        </a>
                      </Link>
                    </Card>
                 );
              })}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}


// Skeleton Loader for the Feed
function FeedSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, index) => ( // Show 8 skeletons
                <Card key={index} className="overflow-hidden shadow-md bg-card border-border">
                    <Skeleton className="h-40 w-full" />
                    <div className="p-4 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-3 w-1/4" />
                        <Skeleton className="h-4 w-full" />
                         <Skeleton className="h-4 w-5/6" />
                    </div>
                </Card>
            ))}
        </div>
    );
}
