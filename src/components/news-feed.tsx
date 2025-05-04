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
  SidebarFooter, // Added import
  SidebarMenu,
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
import type { NewsArticle } from '@/services/news-scraper.interface'; // Corrected import
import { getAllStoredArticles, storeArticle } from '@/services/firebase-storage'; // Import fetch function
import type { StoredArticleData } from '@/services/firebase-storage';
import { summarizeArticle } from '@/ai/flows/summarize-article';
import { performScraping } from '@/services/news-scraper'; // Import actual scraping function

const NEWS_SOURCES = ['BBC', 'New York Times', 'Reuters', 'Associated Press', 'Al Jazeera'];
const ARTICLES_PER_SOURCE_LIMIT = 10; // Kept for scraping limit

export function NewsFeed() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(NEWS_SOURCES);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch *stored* articles from Firebase Storage using React Query
  const {
    data: allArticles = [],
    isLoading: isLoadingArticles,
    isFetching: isFetchingArticles,
    error: articlesError,
  } = useQuery<StoredArticleData[], Error>({
    queryKey: ['storedArticles'], // Unique query key for stored articles
    queryFn: async () => {
       console.log('Fetching stored articles from Firebase Storage...');
       try {
         const articles = await getAllStoredArticles();
         console.log(`Fetched ${articles.length} stored articles.`);
         return articles;
       } catch (err) {
         console.error('Error fetching stored articles:', err);
         toast({
           variant: "destructive",
           title: 'Error Loading Articles',
           description: (err as Error).message || 'Could not fetch stored articles.',
         });
         // Re-throw the error to let React Query handle it
         throw err;
       }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (articles refetch periodically)
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

   // Mutation for triggering the scraping Server Action
  const scrapeMutation = useMutation({
    mutationFn: async (sources: string[]) => {
       toast({ title: `Initiating scraping for ${sources.join(', ')}...` });
       // Call the Server Action
       return await scrapeAndStoreArticles(sources, ARTICLES_PER_SOURCE_LIMIT);
    },
    onSuccess: (result) => {
       if (result.success) {
           toast({ title: 'Scraping Complete', description: `Processed ${result.processedCount} articles from ${result.sourcesAttempted} sources.` });
           // Invalidate and refetch the stored articles query to show the new data
           queryClient.invalidateQueries({ queryKey: ['storedArticles'] });
       } else {
           toast({
               variant: "destructive",
               title: 'Scraping Partially Successful',
               description: result.error || 'Some sources may have failed.',
           });
            // Still invalidate, some might have succeeded
           queryClient.invalidateQueries({ queryKey: ['storedArticles'] });
       }
    },
    onError: (error) => {
       toast({
         variant: "destructive",
         title: 'Scraping Failed',
         description: (error as Error).message || 'An unexpected error occurred during scraping initiation.',
       });
    }
  });


  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
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
    if (!selectedSources.length) {
      toast({
        variant: "destructive",
        title: 'No Sources Selected',
        description: 'Please select at least one source to trigger scraping.',
      });
      return;
    }
    // Call the mutation with the selected sources
    scrapeMutation.mutate(selectedSources);
  };


  const filteredArticles = useMemo(() => {
     // Filter based on the fetched stored articles
    return allArticles.filter((article) =>
        (selectedSources.length === 0 || selectedSources.includes(article.source)) &&
        (article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (article.content && article.content.toLowerCase().includes(searchTerm.toLowerCase()))) // Check content exists
    ).sort((a, b) => {
        // Sort by date if available, otherwise keep original order (or sort by title)
        // Assuming scrapedAt or publishedAt might be added later
        // For now, just keep the order or sort by title as a fallback
        return b.title.localeCompare(a.title); // Simple title sort for now
      });
  }, [allArticles, selectedSources, searchTerm]);


   const isLoading = isLoadingArticles || scrapeMutation.isPending;


  return (
    <SidebarProvider>
      <Sidebar side="left">
        <SidebarHeader>
           <div className="flex items-center justify-between p-2">
             <h2 className="text-lg font-semibold text-sidebar-foreground">News Sources</h2>
             <SidebarTrigger className="md:hidden text-sidebar-foreground"/>
           </div>

        </SidebarHeader>
        <SidebarContent>
           <ScrollArea className="h-[calc(100vh-150px)] px-2"> {/* Adjust height as needed */}
            <div className="space-y-2">
               <div className="flex items-center space-x-2 p-2">
                  <Checkbox
                     id="select-all"
                     checked={selectedSources.length === NEWS_SOURCES.length}
                     onCheckedChange={(checked) => handleSelectAllSources(Boolean(checked))}
                     className="border-sidebar-primary data-[state=checked]:bg-sidebar-primary data-[state=checked]:text-sidebar-primary-foreground"
                  />
                  <Label htmlFor="select-all" className="font-medium text-sidebar-foreground">Select All</Label>
               </div>
               {NEWS_SOURCES.map((source) => (
               <div key={source} className="flex items-center space-x-2 p-2 rounded-md hover:bg-sidebar-accent">
                  <Checkbox
                     id={source}
                     checked={selectedSources.includes(source)}
                     onCheckedChange={() => handleSourceChange(source)}
                     className="border-sidebar-primary data-[state=checked]:bg-sidebar-primary data-[state=checked]:text-sidebar-primary-foreground"
                  />
                  <Label htmlFor={source} className="w-full cursor-pointer text-sidebar-foreground">{source}</Label>
               </div>
               ))}
            </div>
          </ScrollArea>
        </SidebarContent>
         <SidebarFooter> {/* Changed from Header to Footer for button placement */}
             <Button
                onClick={handleScrapeLatest}
                disabled={isLoading}
                className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
             >
                {scrapeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {scrapeMutation.isPending ? 'Scraping...' : 'Scrape Latest'}
             </Button>
         </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="p-4 md:p-6">
          <header className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
             <div className="flex items-center gap-2">
                 {/* Use Button for the trigger and apply text color */}
                <Button variant="ghost" size="icon" className="hidden md:flex text-foreground" asChild>
                    <SidebarTrigger />
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">NewsCast Now</h1>
            </div>
            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search articles..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 w-full md:w-64 lg:w-80 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </header>

          {isLoading && !filteredArticles.length && ( // Show loader only if initial load or scrape and no articles yet
             <div className="flex justify-center items-center py-10">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
           )}

            {articlesError && ( // Display error fetching stored articles
              <div className="flex flex-col items-center justify-center text-center py-10 text-destructive bg-destructive/10 rounded-lg border border-destructive">
                 <AlertTriangle className="w-12 h-12 mb-4" />
                 <h2 className="text-xl font-semibold mb-2">Error Loading Feed</h2>
                 <p className="text-muted-foreground mb-4 max-w-md">
                    {articlesError.message || 'Could not fetch the news feed. Please try again later or attempt to scrape latest content.'}
                 </p>
                 {/* Optional: Add a refetch button */}
                 <Button variant="destructive" onClick={() => queryClient.refetchQueries({ queryKey: ['storedArticles'] })}>
                    Try Reloading Feed
                 </Button>
              </div>
            )}

          {!isLoading && !articlesError && filteredArticles.length === 0 && (
            <div className="text-center text-muted-foreground py-10">
              No articles found matching your criteria. Try adjusting the search/sources or scrape latest content.
            </div>
          )}

          {!articlesError && ( // Only render grid if no fetch error
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article) => {
                 const articleId = encodeURIComponent(article.url); // Use URL as basis for ID
                 return (
                    <Card key={articleId} className="overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200 bg-card text-card-foreground border-border group">
                      <Link href={`/article/${articleId}`} passHref legacyBehavior>
                        <a className="block">
                           <div className="relative h-48 w-full">
                             <Image
                               src={article.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(article.title)}/400/300`}
                               alt={article.title}
                               layout="fill"
                               objectFit="cover"
                               data-ai-hint="news article technology business world"
                               onError={(e) => {
                                  // Fallback if image fails to load
                                  e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(article.title)}/400/300`
                               }}
                               className="transition-transform duration-300 group-hover:scale-105" // Added subtle hover effect
                             />
                           </div>
                          <CardHeader>
                            <CardTitle className="text-lg line-clamp-2">{article.title}</CardTitle>
                             <p className="text-sm text-muted-foreground pt-1">{article.source}</p>
                          </CardHeader>
                          <CardContent>
                            {/* Ensure content exists before trying to display */}
                            <p className="text-sm text-muted-foreground line-clamp-3">{article.content || 'Content not available.'}</p>
                          </CardContent>
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
