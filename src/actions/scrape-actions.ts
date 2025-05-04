'use server';

import axios from 'axios';
import * as cheerio from 'cheerio';
import { summarizeArticle } from '@/ai/flows/summarize-article';
import { storeArticle } from '@/services/firebase-storage';

// Interfaces
interface NewsArticle {
    title: string;
    url: string;
    content: string;
    source: string;
    imageUrl?: string;
    generatedScript?: string;
}

interface ScrapeResult {
    success: boolean;
    processedCount: number;
    sourcesAttempted: number;
    error?: string;
}

interface ScrapingConfig {
    url: string;
    selector: {
        article: string;
        title: string;
        content: string;
        imageUrl: string;
        link: string;
    };
}

// Scraping configuration
const scrapingConfig: Record<string, ScrapingConfig> = {
    'BBC': {
        url: 'https://www.bbc.com/news',
        selector: {
            article: 'div[data-component="card"]',
            title: 'h3, [class*="title"], [class*="headline"]',
            content: 'p[class*="description"], p[class*="summary"]',
            imageUrl: 'img, [data-testid="image"]',
            link: 'a[href]'
        }
    },
    'New York Times': {
        url: 'https://www.nytimes.com',
        selector: {
            article: 'article, li[class*="story"]',
            title: 'h3, h2',
            content: 'p[class*="summary"]',
            imageUrl: 'img',
            link: 'a[href]'
        }
    },
    'Reuters': {
        url: 'https://www.reuters.com',
        selector: {
            article: 'article, [data-testid="ContentCard"]',
            title: 'h3, [class*="headline"]',
            content: 'p[class*="text"], div[class*="summary"]',
            imageUrl: 'img',
            link: 'a[href]'
        }
    },
    'Associated Press': {
        url: 'https://apnews.com',
        selector: {
            article: '[class*="FeedCard"], [class*="Card"]',
            title: 'h3, [class*="headline"]',
            content: 'p[class*="summary"], div[class*="text"]',
            imageUrl: 'img, picture img',
            link: 'a[href]'
        }
    },
    'Al Jazeera': {
        url: 'https://www.aljazeera.com',
        selector: {
            article: 'article, [class*="card"]',
            title: '[class*="title"], h3, h2',
            content: 'p[class*="description"], div[class*="text"]',
            imageUrl: 'img, [class*="image"] img',
            link: 'a[class*="link"], a[href]'
        }
    }
};

// Utility to resolve relative URLs
const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
    try {
        return new URL(relativeUrl, baseUrl).toString();
    } catch {
        return relativeUrl;
    }
};

// Scraping function
async function performScraping(source: string, limit: number): Promise<NewsArticle[]> {
    const config = scrapingConfig[source];
    if (!config) {
        console.error(`No configuration for source: ${source}`);
        return [];
    }

    try {
        const response = await axios.get(config.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 15000
        });

        if (response.status !== 200) {
            console.error(`Failed to fetch ${source}: Status ${response.status}`);
            return [];
        }

        const $ = cheerio.load(response.data);
        const articles: NewsArticle[] = [];
        const articleElements = $(config.selector.article).slice(0, limit);

        for (const element of articleElements) {
            try {
                const $element = $(element);
                const title = $element.find(config.selector.title).first().text().trim();

                // Get URL from link selector
                let articleUrl = $element.find(config.selector.link).first().attr('href') ||
                                $element.attr('href') || '';

                // Resolve relative URL
                articleUrl = resolveUrl(config.url, articleUrl);

                const content = $element.find(config.selector.content).first().text().trim();
                let imageUrl = $element.find(config.selector.imageUrl).first().attr('src') ||
                              $element.find(config.selector.imageUrl).first().attr('data-src') || '';

                // Resolve image URL
                if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = resolveUrl(config.url, imageUrl);
                }

                if (title && articleUrl) {
                    articles.push({
                        title,
                        url: articleUrl,
                        content: content || 'No content available',
                        source,
                        imageUrl: imageUrl || undefined
                    });
                }
            } catch (error) {
                console.error(`Error parsing article from ${source}:`, error);
            }
        }

        console.log(`Scraped ${articles.length} articles from ${source}`);
        return articles;
    } catch (error) {
        console.error(`Error scraping ${source}:`, error);
        return [];
    }
}

/**
 * Server Action to scrape news articles, generate summaries, and store in Firebase
 * @param sources Array of news source names
 * @param limit Maximum articles per source
 * @returns ScrapeResult
 */
export async function scrapeAndStoreArticles(sources: string[], limit: number): Promise<ScrapeResult> {
    let processedCount = 0;
    const errors: string[] = [];

    for (const source of sources) {
        try {
            const articles = await performScraping(source, limit);

            if (!articles.length) {
                errors.push(`No articles found for ${source}`);
                continue;
            }

            const processingPromises = articles.map(async (article) => {
                try {
                    if (!article.url) {
                        console.error(`Invalid URL for article: ${article.title}`);
                        return;
                    }

                    // Generate summary
                    const { script } = await summarizeArticle({ content: article.content });

                    // Store article
                    const articleId = encodeURIComponent(article.url);
                    const dataToStore: NewsArticle = {
                        ...article,
                        generatedScript: script
                    };

                    await storeArticle(articleId, dataToStore);
                    processedCount++;
                } catch (error) {
                    const errorMsg = `Error processing "${article.title}": ${(error as Error).message}`;
                    console.error(errorMsg);
                    errors.push(errorMsg);
                }
            });

            await Promise.all(processingPromises);
        } catch (error) {
            const errorMsg = `Error scraping ${source}: ${(error as Error).message}`;
            console.error(errorMsg);
            errors.push(errorMsg);
        }
    }

    return {
        success: errors.length === 0,
        processedCount,
        sourcesAttempted: sources.length,
        error: errors.length > 0 ? errors.join('; ') : undefined
    };
}
