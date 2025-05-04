'use client';

import type { ChangeEvent, FormEvent } from 'react';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Loader2, RefreshCw } from 'lucide-react';
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
import { scrapeNews } from '@/services/news-scraper'; // Assuming this is implemented correctly
import type { NewsArticle } from '@/services/news-scraper';
import { storeArticle } from '@/services/firebase-storage'; // Assuming this is implemented correctly
import { summarizeArticle } from '@/ai/flows/summarize-article';

const NEWS_SOURCES = ['BBC', 'New York Times', 'Reuters', 'Associated Press', 'Al Jazeera'];
const ARTICLES_PER_SOURCE_LIMIT = 10;

export function NewsFeed() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(NEWS_SOURCES);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch articles from all sources initially
  const {
    data: allArticles = [],
    isLoading: isLoadingArticles,
    isFetching: isFetchingArticles,
    error: articlesError,
  } = useQuery<NewsArticle[], Error>({
    queryKey: ['articles', selectedSources],
    queryFn: async () => {
      // In a real app, this would likely involve fetching pre-scraped data
      // or triggering scraping jobs if data is stale.
      // For this example, we'll simulate fetching, assuming scrapeNews can handle multiple sources
      // or we call it individually. We'll use placeholder data here.
      console.log('Simulating fetching articles for sources:', selectedSources);
      // Replace with actual data fetching logic.
      // Fetching from cache first or database.
      // Simulate fetching from a backend/cache if available
      const cachedData = queryClient.getQueryData<NewsArticle[]>(['articles', selectedSources]);
      if (cachedData) return cachedData;

      // Simulate scraping if no cache (replace with actual logic if needed on client)
      // This is generally NOT recommended on the client due to performance and security.
      // It's better handled by a backend service.
      const fetchedArticles: NewsArticle[] = [];
       for (const source of selectedSources) {
         try {
           // Use a placeholder fetch for demonstration
           const articles = await scrapeNews(source); // Use placeholder data
           fetchedArticles.push(...articles.slice(0, ARTICLES_PER_SOURCE_LIMIT));
         } catch (err) {
           console.error(`Error fetching articles for ${source}:`, err);
           toast({
            variant: "destructive",
            title: `Error fetching ${source}`,
            description: (err as Error).message || 'Could not fetch articles.',
           });
         }
       }
       return fetchedArticles;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

   // Mutation for scraping latest content
  const scrapeMutation = useMutation({
    mutationFn: async (sources: string[]) => {
      const results: NewsArticle[] = [];
      let hasError = false;
      for (const source of sources) {
        try {
          toast({ title: `Scraping ${source}...` });
          const scraped = await scrapeNews(source); // Call the actual scraper
          const limitedArticles = scraped.slice(0, ARTICLES_PER_SOURCE_LIMIT);

          // Generate scripts and store concurrently
          await Promise.all(limitedArticles.map(async (article) => {
             try {
                const { script } = await summarizeArticle({ content: article.content });
                // Store original article + script in Firebase
                // The ID could be derived from the URL or a generated UUID
                const articleId = encodeURIComponent(article.url); // Example ID generation
                await storeArticle(articleId, { ...article, generatedScript: script });
                results.push({ ...article, generatedScript: script }); // Add to results if needed locally
             } catch (aiError) {
                 console.error(`Error generating script or storing article ${article.url}:`, aiError);
                 toast({
                   variant: "destructive",
                   title: `Error Processing ${article.title}`,
                   description: 'Could not generate script or store article.',
                 });
                 // Decide if you want to include the article without a script
                 // results.push(article);
              }
          }));

        } catch (err) {
          console.error(`Error scraping ${source}:`, err);
          hasError = true;
          toast({
            variant: "destructive",
            title: `Error Scraping ${source}`,
            description: (err as Error).message || 'Could not scrape articles.',
          });
        }
      }
       if (!hasError) {
         toast({ title: 'Scraping Complete', description: 'Latest articles fetched and processed.' });
       } else {
         toast({ title: 'Scraping Partially Successful', description: 'Some sources failed to scrape.' });
       }
       return results; // Return all successfully processed articles
    },
    onSuccess: (data) => {
      // Invalidate and refetch the main articles query to show the new data
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      // Optionally, update the cache directly if the mutation returns the exact data needed
      // queryClient.setQueryData(['articles', selectedSources], data);
    },
    onError: (error) => {
       toast({
         variant: "destructive",
         title: 'Scraping Failed',
         description: (error as Error).message || 'An unexpected error occurred during scraping.',
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
        description: 'Please select at least one source to scrape.',
      });
      return;
    }
    scrapeMutation.mutate(selectedSources);
  };


  const filteredArticles = useMemo(() => {
    return allArticles.filter((article) =>
        (selectedSources.length === 0 || selectedSources.includes(article.source)) &&
        (article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
         article.content.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [allArticles, selectedSources, searchTerm]);


   if (articlesError) {
    return <div className="flex justify-center items-center h-screen text-destructive">Error loading articles: {articlesError.message}</div>;
  }


  const isLoading = isLoadingArticles || isFetchingArticles || scrapeMutation.isPending;


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
           <div className="flex items-center justify-between p-2">
             <h2 className="text-lg font-semibold">News Sources</h2>
             <SidebarTrigger className="md:hidden"/>
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
                  />
                  <Label htmlFor="select-all" className="font-medium">Select All</Label>
               </div>
               {NEWS_SOURCES.map((source) => (
               <div key={source} className="flex items-center space-x-2 p-2 rounded-md hover:bg-sidebar-accent">
                  <Checkbox
                     id={source}
                     checked={selectedSources.includes(source)}
                     onCheckedChange={() => handleSourceChange(source)}
                  />
                  <Label htmlFor={source} className="w-full cursor-pointer">{source}</Label>
               </div>
               ))}
            </div>
          </ScrollArea>
        </SidebarContent>
         <SidebarHeader>
             <Button
                onClick={handleScrapeLatest}
                disabled={isLoading}
                className="w-full"
             >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Scrape Latest
             </Button>
         </SidebarHeader>
      </Sidebar>

      <SidebarInset>
        <div className="p-4 md:p-6">
          <header className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
             <div className="flex items-center gap-2">
                <SidebarTrigger className="hidden md:flex" />
                <h1 className="text-2xl md:text-3xl font-bold">NewsCast Now</h1>
            </div>
            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search articles..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 w-full md:w-64 lg:w-80"
              />
            </div>
          </header>

          {isLoading && !filteredArticles.length && ( // Show loader only if initial load or full scrape and no articles yet
             <div className="flex justify-center items-center py-10">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
           )}


          {!isLoading && filteredArticles.length === 0 && (
            <div className="text-center text-muted-foreground py-10">
              No articles found matching your criteria. Try adjusting the search or sources.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredArticles.map((article) => (
              <Card key={article.url} className="overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200">
                <Link href={`/article/${encodeURIComponent(article.url)}`} passHref legacyBehavior>
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
                       />
                     </div>
                    <CardHeader>
                      <CardTitle className="text-lg line-clamp-2">{article.title}</CardTitle>
                       <p className="text-sm text-muted-foreground pt-1">{article.source}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">{article.content}</p>
                    </CardContent>
                  </a>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
