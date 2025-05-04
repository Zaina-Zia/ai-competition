'use server';

import { summarizeArticle } from '@/ai/flows/summarize-article';
import { storeArticle } from '@/services/firebase-storage';
import type { NewsArticle } from '@/services/news-scraper.interface';

// Interface for the return value of the Server Action
interface ScrapeResult {
    success: boolean;
    processedCount: number;
    sourcesAttempted: number;
    error?: string;
}

// Placeholder scraping function - REPLACE WITH ACTUAL SCRAPING LOGIC
async function performScraping(source: string, limit: number): Promise<NewsArticle[]> {
    console.log(`[Server Action] Simulating scraping for source: ${source} (limit: ${limit})`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

    // Simulate potential error
    if (Math.random() < 0.15 && source === 'Reuters') { // 15% chance of error for Reuters
        console.error(`[Server Action] Simulated scraping error for ${source}`);
        throw new Error(`Simulated network timeout for ${source}.`);
    }

    // Return placeholder data matching the source
     const placeholderData: { [key: string]: Omit<NewsArticle, 'generatedScript'>[] } = {
      'BBC': [
        { title: `BBC News Update ${Date.now()}`, url: `https://www.bbc.com/news/world-${Date.now()}`, source: 'BBC', content: 'This is fresh content from BBC scraped on the server.', imageUrl: 'https://picsum.photos/seed/bbc-server/400/300' },
        { title: 'Another BBC Story', url: `https://www.bbc.com/news/technology-${Date.now()+1}`, source: 'BBC', content: 'More server-side scraped content from the BBC.', imageUrl: 'https://picsum.photos/seed/bbc-server2/400/300' },
      ],
      'New York Times': [
        { title: `NYT Exclusive Report ${Date.now()}`, url: `https://www.nytimes.com/news/politics-${Date.now()}`, source: 'New York Times', content: 'Server-scraped exclusive from the New York Times.', imageUrl: 'https://picsum.photos/seed/nyt-server/400/300' },
      ],
      'Reuters': [
        { title: `Reuters Breaking ${Date.now()}`, url: `https://www.reuters.com/news/business-${Date.now()}`, source: 'Reuters', content: 'Breaking news content fetched by the server action from Reuters.', imageUrl: 'https://picsum.photos/seed/reuters-server/400/300' },
      ],
      'Associated Press': [
        { title: `AP Wire Update ${Date.now()}`, url: `https://apnews.com/news/sports-${Date.now()}`, source: 'Associated Press', content: 'Associated Press content retrieved via server action.', imageUrl: 'https://picsum.photos/seed/ap-server/400/300'},
      ],
      'Al Jazeera': [
        { title: `Al Jazeera Investigation ${Date.now()}`, url: `https://www.aljazeera.com/news/investigation-${Date.now()}`, source: 'Al Jazeera', content: 'In-depth investigation content from Al Jazeera via server.', imageUrl: 'https://picsum.photos/seed/aj-server/400/300'},
      ]
     };

    return (placeholderData[source] || []).slice(0, limit);
}


/**
 * Server Action to scrape news articles from selected sources,
 * generate summaries using Genkit, and store them in Firebase Storage.
 *
 * @param sources An array of news source names (e.g., ['BBC', 'New York Times']).
 * @param limit The maximum number of articles to process per source.
 * @returns A promise resolving to a ScrapeResult object.
 */
export async function scrapeAndStoreArticles(sources: string[], limit: number): Promise<ScrapeResult> {
    console.log(`[Server Action] Starting scrapeAndStoreArticles for sources: ${sources.join(', ')}`);
    let processedCount = 0;
    let hasErrors = false;
    const errors: string[] = [];

    for (const source of sources) {
        try {
            console.log(`[Server Action] Processing source: ${source}`);
            // 1. Scrape articles (Replace with actual scraping logic)
            const scrapedArticles = await performScraping(source, limit);
            console.log(`[Server Action] Scraped ${scrapedArticles.length} articles for ${source}.`);

            if (scrapedArticles.length === 0) {
                console.log(`[Server Action] No articles found for ${source}, skipping further processing.`);
                continue;
            }

            // 2. Generate scripts and store concurrently
            const processingPromises = scrapedArticles.map(async (article) => {
                try {
                    // Ensure URL is present and valid
                    if (!article.url || typeof article.url !== 'string') {
                         console.error(`[Server Action] Skipping article due to invalid URL: ${JSON.stringify(article)}`);
                        return; // Skip this article
                    }

                    // 2a. Generate script using Genkit flow
                    console.log(`[Server Action] Generating script for: ${article.title}`);
                    const { script } = await summarizeArticle({ content: article.content });
                    console.log(`[Server Action] Script generated for: ${article.title}`);

                    // 2b. Store article data (with script) in Firebase Storage
                    // Use encoded URL as the unique ID for the storage object
                    const articleId = encodeURIComponent(article.url);
                    const dataToStore: NewsArticle = { ...article, generatedScript: script };

                    console.log(`[Server Action] Storing article ${articleId} in Firebase Storage.`);
                    await storeArticle(articleId, dataToStore);
                    console.log(`[Server Action] Successfully stored ${articleId}.`);
                    processedCount++;

                } catch (processingError) {
                    console.error(`[Server Action] Error processing article ${article.url || article.title}:`, processingError);
                    // Collect specific error messages if helpful
                    errors.push(`Error processing "${article.title}": ${(processingError as Error).message}`);
                    hasErrors = true;
                }
            });

            await Promise.all(processingPromises);
            console.log(`[Server Action] Finished processing promises for ${source}.`);

        } catch (scrapeError) {
            console.error(`[Server Action] Error scraping source ${source}:`, scrapeError);
            errors.push(`Error scraping ${source}: ${(scrapeError as Error).message}`);
            hasErrors = true;
        }
    }

    console.log(`[Server Action] Completed scrapeAndStoreArticles. Processed: ${processedCount}, Errors: ${hasErrors}`);
    return {
        success: !hasErrors,
        processedCount: processedCount,
        sourcesAttempted: sources.length,
        error: hasErrors ? `Scraping and processing completed with errors: ${errors.join('; ')}` : undefined,
    };
}
