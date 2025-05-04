"use server";

import axios from 'axios';
import * as cheerio from 'cheerio';
import { summarizeArticle } from '@/ai/flows/summarize-article';
import { storeArticle } from '@/services/firebase-storage';
import pLimit from 'p-limit';
import { URL } from 'url';
import winston from 'winston'; // Assuming a logging library is used
import puppeteer from 'puppeteer';

// Logger setup (replace with your preferred logging solution)
const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
  });

// Interfaces
interface NewsArticle {
  title: string;
  url: string;
  content: string;
  source: string;
  imageUrl?: string;
  generatedScript?: string;
  publishedDate?: string;
}

interface ScrapeResult {
  success: boolean;
  processedCount: number;
  sourcesAttempted: number;
  articlesScraped: number;
  errors: string[];
  metrics: {
    durationMs: number;
    successRate: number;
  };
}

interface SelectorConfig {
  selectors: string[];
  priority?: number;
  minLength?: number;
  required?: boolean;
}

interface ScrapingConfig {
  url: string;
  selector: {
    article: SelectorConfig;
    title: SelectorConfig;
    content: SelectorConfig;
    imageUrl: SelectorConfig;
    link: SelectorConfig;
    publishedDate?: SelectorConfig;
  };
  preprocess?: (html: string) => string; // Optional HTML preprocessing
  postprocess?: (article: NewsArticle) => NewsArticle; // Optional article postprocessing
  useDynamicContent?: boolean; // Flag for JavaScript-rendered pages
  rateLimitMs?: number; // Delay between requests
}

// Scraping configuration with fallback selectors
const scrapingConfig: Record<string, ScrapingConfig> = {
  BBC: {
    url: 'https://www.bbc.com/news',
    selector: {
      article: { selectors: ['div[data-component="card"]', 'article', '[class*="story"]'], minLength: 1 },
      title: { selectors: ['h3', '[class*="title"]', '[class*="headline"]', 'h2'], minLength: 10, required: true },
      content: { selectors: ['p[class*="description"]', 'p[class*="summary"]', 'p'], minLength: 20 },
      imageUrl: { selectors: ['img', '[data-testid="image"]', 'picture img'], minLength: 1 },
      link: { selectors: ['a[href]', '[class*="link"]'], minLength: 1, required: true },
      publishedDate: { selectors: ['time', '[class*="date"]', '[class*="time"]'] },
    },
    rateLimitMs: 1000,
  },
  'New York Times': {
    url: 'https://www.nytimes.com',
    selector: {
      article: { selectors: ['article', 'li[class*="story"]', 'section article'], minLength: 1 },
      title: { selectors: ['h2', 'h3', '[class*="title"]'], minLength: 10, required: true },
      content: { selectors: ['p[class*="summary"]', 'p', 'div[class*="summary"]'], minLength: 20 },
      imageUrl: { selectors: ['img', 'picture img', '[class*="image"] img'], minLength: 1 },
      link: { selectors: ['a[href]'], minLength: 1, required: true },
      publishedDate: { selectors: ['time', '[class*="date"]'] },
    },
    rateLimitMs: 1000,
  },
  // Add other sources similarly...
};

// Generic fallback configuration for unknown sources
const genericConfig: ScrapingConfig = {
  url: '',
  selector: {
    article: { selectors: ['article', 'section[class*="article"]', 'div[class*="card"]'], minLength: 1 },
    title: { selectors: ['h1', 'h2', 'h3', '[class*="title"]', '[class*="headline"]'], minLength: 10, required: true },
    content: { selectors: ['p', 'div[class*="content"]', 'div[class*="text"]'], minLength: 20 },
    imageUrl: { selectors: ['img', 'picture img', '[class*="image"] img'], minLength: 1 },
    link: { selectors: ['a[href]'], minLength: 1, required: true },
    publishedDate: { selectors: ['time', 'span[class*="date"]', 'div[class*="date"]'] },
  },
  rateLimitMs: 1000,
};

// Utility functions
const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
  try {
    const url = new URL(relativeUrl, baseUrl).toString();
    return url.startsWith("http") ? url : "";
  } catch (error) {
    logger.error(`Error resolving URL: ${relativeUrl} against base ${baseUrl}`, error);
    return "";
  }
};



const cleanContent = (text: string): string => {
  return text
    .replace(/[\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const scoreElement = ($: cheerio.CheerioAPI, element: cheerio.Element, selector: string): number => {
  const $element = $(element);
  try {
    let score = 0;
    if (element.type === 'tag') {
    const textLength = $element.text().trim().length;
      const isHeading = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
      element.tagName.toLowerCase()
    );
    const hasRelevantClass =
      selector.includes("title") || selector.includes("headline");
      score += textLength;
    if (isHeading) score += 20;
    if (hasRelevantClass) score += 10;
    if ($element.parents("nav, footer, aside").length === 0) score += 10; // Not in navigation/footer
    }
    return score;
  } catch (error) {
    logger.error("Error scoring element", error);
    return 0;
  }
};

const fetchDynamicContent = async (url: string): Promise<string> => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const content = await page.content();
    await browser.close();
    return content;
  } catch (error) {
    logger.error(`Error fetching dynamic content for ${url}:`, error);
    return '';
  }
};

// Scraping function
async function performScraping(source: string, limit: number, concurrency: number = 5): Promise<NewsArticle[]> {  
  let config = scrapingConfig[source] || { ...genericConfig, url: source };
  if (!config.url) {
    logger.error(`No valid URL for source: ${source}`);
    return [];
  }

  const limitConcurrency = pLimit(concurrency);
  const articles: NewsArticle[] = [];
  const seenUrls = new Set<string>();

  try {
    // Fetch page content
    let html = '';
    if (config.useDynamicContent) {
      html = await fetchDynamicContent(config.url);
    } else {
      const response = await axios.get(config.url, {
        headers: {
          'User-Agent':
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        timeout: 15000, // Added a timeout to avoid indefinite wait
        validateStatus: (status) => status >= 200 && status < 300,
      });
      html = response.data;
    }

    if (config.preprocess) {
      html = config.preprocess(html);
    }

    const $ = cheerio.load(html, { decodeEntities: true });    
    const articleElements = $(config.selector.article.selectors.join(",")).slice(0, limit * 2); // Oversample to account for filtering

    const scrapingPromises = Array.from(articleElements).map((element) =>
      limitConcurrency(async () => {
        try {
          if(!element) {
            throw new Error("Element is null or undefined");
          }
          const $element = $(element);
          const article: Partial<NewsArticle> = { source };

          // Helper to select best element
          const selectBest = (selectorConfig: SelectorConfig, field: keyof NewsArticle): string => {
            let bestElement: cheerio.Element | null = null;
            let bestScore = -1;

            for (const selector of selectorConfig.selectors) {
              const elements = $element.find(selector).toArray();
              for (const el of elements) {                                        
                const score = scoreElement($, el, selector);
                if (score > bestScore && $(el).text().trim().length >= (selectorConfig.minLength || 0)) {
                  bestElement = el;
                  bestScore = score;
                }
              }
            }

            const text = bestElement ? cleanContent($(bestElement).text()) : '';
            if (selectorConfig.required && !text) {
                throw new Error(`Required field ${field} not found with selector ${selectorConfig.selectors}`);
            }
            return text;
          };

          // Extract fields
          article.title = selectBest(config.selector.title, 'title');
          article.content = selectBest(config.selector.content, 'content');

          // Extract link
          let articleUrl = '';
          for (const selector of config.selector.link.selectors) {
            articleUrl = $element.find(selector).first().attr('href') || $element.attr('href') || '';            
            if (articleUrl) break;
          }
          article.url = resolveUrl(config.url, articleUrl);          
          if (!article.url || seenUrls.has(article.url)) {            
            return;
          }
          seenUrls.add(article.url);

          // Extract image
          let imageUrl = '';
          for (const selector of config.selector.imageUrl.selectors) {
            imageUrl = $element.find(selector).first().attr('src') ||
            $element.find(selector).first().attr('data-src') ||
            '';            

            if (imageUrl) break;
          }
          article.imageUrl = imageUrl ? resolveUrl(config.url, imageUrl) : undefined;

          // Extract published date (optional)
          article.publishedDate = config.selector.publishedDate
            ? selectBest(config.selector.publishedDate, 'publishedDate')
            : undefined;

          // Validate article
          if (!article.title || article.title.length < 10 || !article.url) {
            return;
          }

          // Fetch full article content if summary is too short          
          if (article.content && article.content.length < 50) {            
            try {
              const articleResponse = await axios.get(article.url, { timeout: 10000 });
              const article$ = cheerio.load(articleResponse.data);
              article$("script, style, nav, footer, aside").remove();
              const fullContent = article$("p, div[class*=\"content\"]").text().trim();
              article.content = cleanContent(fullContent).slice(0, 1000); // Limit length              
            } catch (error) {              
                logger.warn(`Failed to fetch full content for ${article.url}:`, error);              
              }
            }          

          // Apply postprocessing
          if (config.postprocess) {
            Object.assign(article, config.postprocess(article as NewsArticle));
          }

          articles.push(article as NewsArticle);
        } catch (error) {
          logger.error(`Error parsing article from ${source}:`, error);          
        }
      })
    );

    await Promise.all(scrapingPromises);
    logger.info(`Scraped ${articles.length} articles from ${source}`);
    return articles.slice(0, limit); // Respect the limit
  } catch (error) {
    logger.error(`Error scraping ${source}:`, error);
    return [];
  }
}

/**
 * Server Action to scrape news articles, generate summaries, and store in Firebase
 * @param sources Array of news source names or URLs
 * @param limit Maximum articles per source
 * @param concurrency Maximum concurrent requests
 * @returns ScrapeResult
 */
export async function scrapeAndStoreArticles(
  sources: string[],
  limit: number,
  concurrency: number = 5
): Promise<ScrapeResult> {
  const startTime = Date.now();
  let processedCount = 0;
  let articlesScraped = 0;
  const errors: string[] = [];
  const limitConcurrency = pLimit(concurrency);

  const scrapingPromises = sources.map((source) =>
    limitConcurrency(async () => {
      try {
        const articles = await performScraping(source, limit, concurrency);
        articlesScraped += articles.length;

        const processingPromises = articles.map(async (article) =>
          limitConcurrency(async () => {
            try {
              // Generate summary
              const { script } = await summarizeArticle({ content: article.content });              

              // Store article
              const articleId = encodeURIComponent(article.url);
              const dataToStore: NewsArticle = {
                ...article,
                generatedScript: script,
              };

              await storeArticle(articleId, dataToStore);
              processedCount++;
            } catch (error) {              
              const errorMsg = `Error processing "${article.title}": ${(error as Error).message}`;
              logger.error(errorMsg);
              errors.push(errorMsg);
            }
          })
        );

        await Promise.all(processingPromises);        
      } catch (error) {
        const errorMsg = `Error scraping ${source}: ${(error as Error).message}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    })
  );

  await Promise.all(scrapingPromises);

  const durationMs = Date.now() - startTime;
  const successRate = sources.length > 0 ? processedCount / (sources.length * limit) : 0;

  return {
    success: errors.length === 0,
    processedCount,
    sourcesAttempted: sources.length,
    articlesScraped,
    errors,
    metrics: {
      durationMs,
      successRate: Math.min(1, successRate),
    },
  };
}