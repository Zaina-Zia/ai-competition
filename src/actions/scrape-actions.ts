"use server";

import axios from 'axios';
import * as cheerio from 'cheerio';
import { summarizeArticle } from '@/ai/flows/summarize-article';
import { storeArticle } from '@/services/firebase-storage';
import type { StoredArticleData } from '@/services/firebase-storage';
import pLimit from 'p-limit';
import { URL } from 'url';
import puppeteer from 'puppeteer';
import { encodeBase64UrlSafe } from '@/lib/utils'; // Import the helper function


// --- Interfaces ---
interface NewsArticle {
  title: string;
  url: string;
  content: string; // This will primarily hold the *full* content after fetch attempt
  source: string;
  imageUrl?: string;
  publishedDate?: string; // Store raw date string
  summary?: string; // Add a dedicated field for the initial summary/teaser
}

// Use StoredArticleData where the generated script is expected
// type StoredArticleData = NewsArticle & { generatedScript?: string };

interface ScrapeResult {
  success: boolean;
  processedCount: number; // Articles successfully summarized and stored
  sourcesAttempted: number;
  articlesScraped: number; // Articles successfully scraped (before summarization/storage)
  errors: string[];
  metrics: {
    durationMs: number;
    successRate: number; // Based on processedCount / (sources * limit)
  };
}

interface SelectorConfig {
  selectors: string[];
  priority?: number; // Could be used in scoring, currently unused but kept for potential future use
  minLength?: number; // Minimum character length for the extracted text
  required?: boolean; // If true, scraping the article fails if this field is missing
}

interface ScrapingConfig {
  url: string;
  sourceName: string; // Explicit source name for clarity
  selector: {
    article: SelectorConfig;
    title: SelectorConfig;
    summary: SelectorConfig; // Renamed from 'content' for clarity - primarily for summary/preview on index page
    imageUrl: SelectorConfig;
    link: SelectorConfig;
    publishedDate?: SelectorConfig;
    // Selector for fetching full article content on the article's page
    fullContent: SelectorConfig; // Keep this for the full content fetch
  };
  preprocess?: (html: string, $: cheerio.CheerioAPI) => cheerio.CheerioAPI; // Optional HTML preprocessing, now receives CheerioAPI
  postprocess?: (article: NewsArticle) => NewsArticle; // Optional article postprocessing
  useDynamicContent?: boolean; // Flag for JavaScript-rendered pages
  rateLimitMs?: number; // Delay between requests to the same source
  fetchFullArticle?: boolean; // Whether to attempt fetching the full article content
  headers?: Record<string, string>; // Custom headers for requests
}

// --- Utility Functions ---

/**
 * Introduces an asynchronous delay.
 * @param ms Milliseconds to wait.
 */
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resolves a relative URL against a base URL.
 * Returns an empty string if resolution fails or the result is not http/https.
 */
const resolveUrl = (baseUrl: string, relativeUrl: string | undefined): string => {
  if (!relativeUrl) return "";
  try {
    // Ensure the base URL itself has a protocol
    const base = new URL(baseUrl);
    const resolved = new URL(relativeUrl, base).toString();
    // Only return valid http/https URLs
    return resolved.startsWith("http") ? resolved : "";
  } catch (error) {
    console.warn(`Error resolving URL: '${relativeUrl}' against base '${baseUrl}'`, { error: (error as Error).message });
    return "";
  }
};

/**
 * Cleans text content by removing excessive whitespace, script/style tags, and trimming.
 * More aggressive cleaning.
 */
const cleanContent = (text: string | undefined): string => {
  if (!text) return '';
  return text
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '') // Remove script tags and content
    .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, '')   // Remove style tags and content
    .replace(/<!--.*?-->/gs, '') // Remove HTML comments
    .replace(/<[^>]*>/g, ' ')    // Replace remaining HTML tags with space
    .replace(/[\n\t\r]+/g, ' ') // Replace newlines/tabs/CR with spaces
    .replace(/\s\s+/g, ' ')   // Replace multiple spaces with single space
    .replace(/Advertisement/gi, '') // Remove common ad keywords
    .replace(/Share this story/gi, '') // Remove common sharing prompts
    .trim();
};


/**
 * Scores an element based on text length and tag type for selection priority.
 * @param $ CheerioAPI instance.
 * @param element The Cheerio element to score.
 * @param selector The selector string (for context, e.g., if it hints at being a title).
 * @returns A numerical score.
 */
const scoreElement = ($: cheerio.CheerioAPI, element: cheerio.Element, selector: string): number => {
  if (!element || element.type !== 'tag') {
    return 0; // Only score tag elements
  }

  const $element = $(element);
  try {
    let score = 0;
    const text = $element.text();
    const textLength = cleanContent(text).length; // Use cleaned text length

    // Basic scoring: prioritize longer text
    score += textLength;

    // Boost score for heading tags (more likely to be titles)
    const tagName = element.tagName.toLowerCase();
    if (["h1", "h2", "h3"].includes(tagName)) score += 30;
    else if (["h4", "h5", "h6"].includes(tagName)) score += 15;
    else if (tagName === 'p') score += 5; // Slightly boost paragraphs for content

    // Boost score if the selector hints at relevance (e.g., contains 'title' or 'headline')
    if (selector.toLowerCase().includes("title") || selector.toLowerCase().includes("headline")) score += 20;
    if (selector.toLowerCase().includes("content") || selector.toLowerCase().includes("body") || selector.toLowerCase().includes("article")) score += 10;

    // Penalize if element is likely navigation, footer, or aside content
    if ($element.parents("nav, footer, aside, [role='navigation'], [role='complementary'], .sidebar, .related-posts, .comments-section").length > 0) {
        score -= 50; // Reduce score significantly if it's in ignored sections
    }
     // Penalize if the element itself is a link and we are not looking for a link or title
     if (tagName === 'a' && !selector.toLowerCase().includes('link') && !selector.toLowerCase().includes('title')) {
        score -= 10;
     }


    return Math.max(0, score); // Ensure score is not negative
  } catch (error) {
    console.error("Error scoring element", { selector, error: (error as Error).message });
    return 0;
  }
};


/**
 * Fetches dynamic content using Puppeteer for pages requiring JavaScript rendering.
 * @param url The URL to fetch.
 * @param waitForSelector Optional selector to wait for before getting content.
 * @returns The rendered HTML content as a string, or empty string on failure.
 */
const fetchDynamicContent = async (url: string, waitForSelector?: string): Promise<string> => {
  let browser;
  try {
    console.info(`Fetching dynamic content for: ${url}${waitForSelector ? ` (waiting for: ${waitForSelector})` : ''}`);
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    // Set a realistic viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });

    if (waitForSelector) {
        try {
            console.debug(`Waiting for selector "${waitForSelector}" on ${url}`);
            await page.waitForSelector(waitForSelector, { timeout: 15000 }); // Wait up to 15s for specific content
            console.debug(`Selector "${waitForSelector}" found on ${url}`);
        } catch (waitError) {
            console.warn(`Selector "${waitForSelector}" not found on ${url} after timeout. Proceeding with available content.`);
        }
    } else {
        // Fallback: Add a small delay after network idle if no selector specified
         await page.waitForTimeout(1000);
    }

    const content = await page.content();
    await browser.close();
    console.info(`Successfully fetched dynamic content (${content.length} bytes) for: ${url}`);
    return content;
  } catch (error) {
    console.error(`Error fetching dynamic content for ${url}:`, { error: (error as Error).message });
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`Error closing browser after dynamic fetch error for ${url}:`, { error: (closeError as Error).message });
      }
    }
    return '';
  }
};

// --- Scraping Configuration ---
// NOTE: Selectors are highly volatile and WILL require maintenance.
// Prefer selectors with stable IDs or data attributes (like data-testid) when available.
// Order selectors from most specific/likely to least specific.
const scrapingConfig: Record<string, ScrapingConfig> = {
  BBC: {
    url: 'https://www.bbc.com/news',
    sourceName: 'BBC',
    selector: {
      article: { selectors: ['div[type="article"]', 'div[data-testid*="card"]', 'article[class*="ArticleWrapper"]', 'li[class*="ListItem"]'] },
      link: { selectors: ['a[data-linktrack*="news"]', 'a[class*="Link"]', 'a'], required: true },
      title: { selectors: ['h3[data-testid="card-headline"]', 'h2', 'h3', 'span[class*="Title"]'], minLength: 10, required: true },
      summary: { selectors: ['p[data-testid="card-description"]', 'p[class*="Summary"]', 'p'], minLength: 20 },
      imageUrl: { selectors: ['div[data-testid="card-image"] img', 'img'] },
      publishedDate: { selectors: ['time[datetime]', 'span[class*="Timestamp"]'] },
      fullContent: { selectors: ['main#main-content article', 'article', 'div[data-component="text-block"]', 'p'] }
    },
    fetchFullArticle: true,
    rateLimitMs: 1200,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    }
  },
  Reuters: {
    url: 'https://www.reuters.com/world/', // More specific section
    sourceName: 'Reuters',
    selector: {
      article: { selectors: ['li[class*="story-collection"]', 'div[data-testid="MediaStoryCard"]', 'article'] },
      link: { selectors: ['a[data-testid="Heading"]', 'a[href*="/world/"]', 'a'], required: true },
      title: { selectors: ['a[data-testid="Heading"] span', 'h3', 'h2'], minLength: 10, required: true },
      summary: { selectors: ['p'], minLength: 20 }, // Often minimal on index pages
      imageUrl: { selectors: ['img[data-testid*="image"]', 'img'] },
      publishedDate: { selectors: ['time[datetime]', 'span[class*="date"]'] },
      fullContent: { selectors: ['article[data-testid="article"]', '#main-content', 'div[class*="article-body"]', 'p'] } // Added more specific body selector
    },
    fetchFullArticle: true,
    rateLimitMs: 1500,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    }
  },
  CNN: {
      url: 'https://www.cnn.com/',
      sourceName: 'CNN',
      useDynamicContent: true,
      selector: {
          article: { selectors: ['article[class*="container"]', 'div[class*="card"]', 'section[data-zone-label] li'] },
          link: { selectors: ['a[data-link_type="article"]', 'a[href^="/"]'], required: true },
          title: { selectors: ['span[data-editable="headline"]', '.container__headline-text', 'h2', 'h3'], minLength: 10, required: true },
          summary: { selectors: ['div[data-editable="description"]', 'p'], minLength: 15 },
          imageUrl: { selectors: ['img[class*="image__dam"]', 'picture img'] },
          publishedDate: { selectors: ['div[class*="timestamp"]', 'time'] },
          // More specific content selectors for CNN
          fullContent: { selectors: ['div[class*="article__content"]', '.article__content', 'div.paragraph', 'p'] }
      },
      fetchFullArticle: true,
      rateLimitMs: 2000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    }
  },
    FoxNews: {
      url: 'https://www.foxnews.com/',
      sourceName: 'Fox News',
      selector: {
          article: { selectors: ['article.article', 'div.info'] },
          link: { selectors: ['a[href^="https://www.foxnews.com/"]', 'h2 > a', 'h3 > a', 'a'], required: true },
          title: { selectors: ['h2.title', 'h3.title', 'h1'], minLength: 10, required: true },
          summary: { selectors: ['p.dek', 'p'], minLength: 15 },
          imageUrl: { selectors: ['img.image-m'] },
          publishedDate: { selectors: ['span.time', 'time'] },
          fullContent: { selectors: ['div.article-body', 'p'] }
      },
      fetchFullArticle: true,
      rateLimitMs: 1300,
       headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      }
  },
   NPR: {
      url: 'https://www.npr.org/sections/news/',
      sourceName: 'NPR',
      selector: {
          article: { selectors: ['article.item', 'div.story-wrap'] },
          link: { selectors: ['a[href*=".npr.org/"]', 'h2 > a', 'h3 > a', 'a'], required: true },
          title: { selectors: ['h2.title', 'h3.title'], minLength: 10, required: true },
          summary: { selectors: ['p.teaser', 'p'], minLength: 20 },
          imageUrl: { selectors: ['img.img'] },
          publishedDate: { selectors: ['time[datetime]'] },
          fullContent: { selectors: ['div#storytext', 'p'] }
      },
      fetchFullArticle: true,
      rateLimitMs: 1000,
  },
  'The Guardian': {
      url: 'https://www.theguardian.com/us',
      sourceName: 'The Guardian',
      selector: {
          article: { selectors: ['div.fc-item', 'section[data-component="container"] li'] },
          link: { selectors: ['a[data-link-name="article"]', 'a[href*="theguardian.com/"]', 'a'], required: true },
          title: { selectors: ['span.show-underline', 'h3'], minLength: 10, required: true },
          summary: { selectors: ['div.fc-item__standfirst', 'p'], minLength: 20 },
          imageUrl: { selectors: ['img'] },
          publishedDate: { selectors: ['time[datetime]'] },
          fullContent: { selectors: ['div#maincontent', 'article[class*="content__article"]', 'p'] } // Added specific article body selector
      },
      fetchFullArticle: true,
      rateLimitMs: 1100,
  },
  'New York Times': {
      url: 'https://www.nytimes.com/',
      sourceName: 'New York Times',
      useDynamicContent: true, // NYT almost always requires JS
      selector: {
          article: { selectors: ['section[data-testid="block-G"] li', 'article', 'div[class*="StoryCard"]'] },
          link: { selectors: ['a[href^="/"]', 'h3 > a', 'a'], required: true },
          title: { selectors: ['p[id^="title_"]', 'h3', 'h2'], minLength: 10, required: true },
          summary: { selectors: ['p[class*="summary"]', 'p'], minLength: 20 },
          imageUrl: { selectors: ['img'] },
          publishedDate: { selectors: ['time', 'span[data-testid="todays-date"]'] },
          fullContent: { selectors: ['section[name="articleBody"]', 'div.StoryBodyCompanionColumn', 'p'] } // Added common NYT body div
      },
      fetchFullArticle: true, // Will likely fail often without login/subscription
      rateLimitMs: 2500,
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      }
  },
  'Al Jazeera': {
        url: 'https://www.aljazeera.com/',
        sourceName: 'Al Jazeera',
        selector: {
            article: { selectors: ['article.gc', 'div.card-news'] },
            link: { selectors: ['a.gc__link', 'a[href^="/news/"]', 'a[href^="/features/"]', 'a'], required: true },
            title: { selectors: ['a.gc__link span', 'h3', 'h2'], minLength: 10, required: true },
            summary: { selectors: ['div.gc__excerpt p', 'p'], minLength: 20 },
            imageUrl: { selectors: ['img.gc__image'] },
            publishedDate: { selectors: ['div.date-simple', 'time'] },
            fullContent: { selectors: ['main#main-content div.wysiwyg', 'p'] }
        },
        fetchFullArticle: true,
        rateLimitMs: 1400,
         headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        }
    },
    // Placeholder for Associated Press - requires finding a suitable public news section
    // AP often distributes via partners, direct scraping might be difficult.
    // 'Associated Press': {
    //     url: 'https://apnews.com/', // Example URL, might need refinement
    //     sourceName: 'Associated Press',
    //     // ... selectors TBD ...
    //     fetchFullArticle: true,
    //     rateLimitMs: 1500,
    // },
};

// Generic fallback configuration (less reliable)
const genericConfig: Omit<ScrapingConfig, 'url' | 'sourceName'> = {
  selector: {
    article: { selectors: ['article', 'div[class*="item"]', 'div[class*="card"]', 'li'] },
    title: { selectors: ['h1', 'h2', 'h3', '[class*="title"]', '[class*="headline"]'], minLength: 10, required: true },
    summary: { selectors: ['p', 'div[class*="summary"]', 'div[class*="excerpt"]', '[class*="teaser"]'], minLength: 20 },
    imageUrl: { selectors: ['img', 'picture img', '[class*="image"] img'] },
    link: { selectors: ['a[href]'], required: true },
    publishedDate: { selectors: ['time', 'span[class*="date"]', 'div[class*="date"]'] },
    fullContent: { selectors: ['article', 'main', 'div[class*="body"]', 'div[class*="content"]', 'section[class*="content"]', 'p'] }
  },
  fetchFullArticle: true, // Attempt generically
  rateLimitMs: 1500,
};

// --- Main Scraping Function ---

/**
 * Performs scraping for a single news source.
 * @param source The name of the source (key in scrapingConfig) or a direct URL.
 * @param limit Maximum number of articles to return.
 * @param concurrency Control for fetching full articles.
 * @returns A promise resolving to an array of NewsArticle objects.
 */
async function performScraping(source: string, limit: number, concurrency: number = 3): Promise<NewsArticle[]> {
  // Determine configuration: Use specific if source name matches, otherwise use generic with URL
  let config: ScrapingConfig;
  if (scrapingConfig[source]) {
      config = scrapingConfig[source];
      console.info(`Using specific config for source: ${source}`);
  } else {
      try {
          // Attempt to use the source string as a URL for generic scraping
          new URL(source); // Validate if 'source' is a URL
          config = { ...genericConfig, url: source, sourceName: source };
          console.info(`Using generic config for URL: ${source}`);
      } catch (_) {
          console.error(`Invalid source or URL provided: ${source}. Skipping.`);
          return [];
      }
  }


  const limitFullArticleFetch = pLimit(concurrency);
  const articles: NewsArticle[] = [];
  const seenUrls = new Set<string>();

  try {
    console.info(`Starting scrape for ${config.sourceName} at ${config.url}...`);

    // Fetch page content (static or dynamic)
    let html = '';
    const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Default UA
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'DNT': '1', // Do Not Track
        ...config.headers, // Allow overriding defaults
    };

    if (config.useDynamicContent) {
        // Pass a potentially relevant selector to wait for on the *index* page if needed
        const indexWaitForSelector = config.selector.article.selectors[0]; // Example: wait for the first article selector
        html = await fetchDynamicContent(config.url, indexWaitForSelector);
        if (!html) throw new Error('Dynamic content fetching failed for index page.');
    } else {
      const response = await axios.get(config.url, {
        headers: requestHeaders,
        timeout: 20000, // Increased timeout
        validateStatus: (status) => status >= 200 && status < 400, // Allow redirects slightly more leniently
      });
        if (response.status >= 300 && response.status < 400 && response.headers.location) {
             console.warn(`Redirected from ${config.url} to ${response.headers.location}. Consider updating the config URL.`);
             // Optionally, follow redirect here, but be cautious of loops
         } else if (response.status >= 400) {
            throw new Error(`HTTP error ${response.status} fetching ${config.url}`);
         }
      html = response.data;
    }

    let $ = cheerio.load(html, { decodeEntities: true });

    // Apply preprocessing if defined
    if (config.preprocess) {
      try {
        $ = config.preprocess(html, $); // Pass CheerioAPI instance
        console.debug(`Preprocessing applied for ${config.sourceName}`);
      } catch (e) {
        console.error(`Error during preprocessing for ${config.sourceName}:`, e);
      }
    }

    // --- Element Selection and Data Extraction ---
    const articleElements = $(config.selector.article.selectors.join(", "));
    console.info(`Found ${articleElements.length} potential article elements for ${config.sourceName}. Targeting limit: ${limit}.`);

     // Helper to select the best element based on scoring
      const selectBest = (
          context: cheerio.Cheerio<cheerio.Element>, // The context to search within (e.g., the article element)
          selectorConfig: SelectorConfig,
          field: keyof NewsArticle | 'link' | 'summary' | 'fullContent' // Specify field type
      ): string => {
          let bestMatchText = '';
          let bestScore = -1;
          let bestElement : cheerio.Element | null = null;

          for (const selector of selectorConfig.selectors) {
              const elements = context.find(selector);

              elements.each((_, el) => {
                   const $el = $(el);
                    let currentText = '';
                    let score = 0;
                    let currentElement : cheerio.Element | null = el;

                    // Skip elements that are visually hidden (basic check)
                    if ($el.css('display') === 'none' || $el.css('visibility') === 'hidden') {
                        return; // Continue to next element
                    }


                    if (field === 'link') {
                        currentText = $el.attr('href') || '';
                        score = currentText.startsWith('http') || currentText.startsWith('/') ? 1 : 0;
                    } else if (field === 'imageUrl') {
                        currentText = $el.attr('src') || $el.attr('data-src') || $el.attr('srcset')?.split(' ')[0] || '';
                        score = currentText ? 1 : 0;
                    } else if (field === 'publishedDate') {
                       currentText = $el.attr('datetime') || cleanContent($el.text());
                       score = currentText ? 1 : 0;
                    } else {
                         // For title, summary, fullContent - use scoring
                        currentText = cleanContent($el.text());
                        score = scoreElement($, el, selector);
                    }

                    const meetsMinLength = !selectorConfig.minLength || currentText.length >= selectorConfig.minLength;

                    if (meetsMinLength && score > bestScore) {
                        bestScore = score;
                        bestMatchText = currentText;
                        bestElement = currentElement;
                    }
              });

               // If we found a good match, maybe stop early? (Optional)
               // if (bestScore > 50 && field !== 'link' && field !== 'imageUrl') break;
          }


          if (selectorConfig.required && !bestMatchText) {
              console.warn(`Required field '${field}' not found for an article using selectors: ${selectorConfig.selectors.join(', ')}`);
          }

          // For 'fullContent', try to get the HTML of the best element for potentially better structure
          if (field === 'fullContent' && bestElement) {
              try {
                   // Extract HTML, then clean it
                   const elementHtml = $(bestElement).html();
                   if (elementHtml) {
                       const cleanedHtmlText = cleanContent(elementHtml); // Apply cleaning to inner HTML
                       if (cleanedHtmlText.length > bestMatchText.length) { // Use if longer
                           bestMatchText = cleanedHtmlText;
                           console.debug(`Using cleaned HTML content for '${field}', length: ${bestMatchText.length}`);
                       }
                   }
              } catch (htmlError) {
                   console.warn(`Could not get/clean HTML for ${field}, falling back to text. Error: ${(htmlError as Error).message}`);
              }
          }

           // console.debug(`Best match for field '${field}': '${bestMatchText.substring(0, 50)}...' (Score: ${bestScore})`);
          return bestMatchText;
      };


    // --- Article Processing Loop ---
    for (const element of articleElements.toArray()) {
        if (articles.length >= limit) break; // Stop if limit is reached

         try {
              const $element = $(element); // Use the Cheerio element directly
              const article: Partial<NewsArticle> = { source: config.sourceName };

              // 1. Extract Link and check uniqueness
              let relativeLink = selectBest($element, config.selector.link, 'link');
              article.url = resolveUrl(config.url, relativeLink);

              if (!article.url || !article.url.startsWith('http') || seenUrls.has(article.url)) {
                 if (relativeLink && !seenUrls.has(resolveUrl(config.url, relativeLink))) {
                    // Debug log for skipped non-duplicate invalid URLs
                    console.debug(`Skipping article: Invalid URL ('${article.url || relativeLink}')`);
                 }
                 continue; // Skip if URL is invalid, non-http, or already processed
              }

              // 2. Extract Title (Required)
              article.title = selectBest($element, config.selector.title, 'title');
               if (!article.title) {
                    console.warn(`Skipping article: Missing required title. URL: ${article.url}`);
                    continue; // Skip if required title is missing
                }

               // 3. Extract Initial Summary/Teaser
               article.summary = selectBest($element, config.selector.summary, 'summary');
               // Initialize main content with summary, it will be overwritten if full fetch succeeds
               article.content = article.summary;


               // 4. Extract Image URL
               let rawImageUrl = selectBest($element, config.selector.imageUrl, 'imageUrl');
               article.imageUrl = resolveUrl(config.url, rawImageUrl);
                // Add common lazy-loading patterns if needed:
                if (!article.imageUrl && rawImageUrl && rawImageUrl.includes('data:image')) {
                     console.debug(`Skipping base64 image for ${article.url}`);
                     article.imageUrl = undefined; // Or set to placeholder
                 }


              // 5. Extract Published Date
              if (config.selector.publishedDate) {
                article.publishedDate = selectBest($element, config.selector.publishedDate, 'publishedDate');
              }

               // 6. Fetch Full Article Content (More Aggressive)
               let fetchedFullContent = false;
               // ALWAYS attempt fetch if configured and selectors exist
               if (config.fetchFullArticle && config.selector.fullContent?.selectors.length > 0) {
                    await limitFullArticleFetch(async () => {
                        try {
                            if (config.rateLimitMs) await wait(config.rateLimitMs);

                            console.info(`Fetching full content for: ${article.url}`);
                            let articleHtml = '';
                            // Determine wait selector for the specific article page
                            const articleWaitForSelector = config.selector.fullContent!.selectors[0]; // Wait for the first full content selector

                            if (config.useDynamicContent) {
                                articleHtml = await fetchDynamicContent(article.url!, articleWaitForSelector);
                            } else {
                                const articleResponse = await axios.get(article.url!, { headers: requestHeaders, timeout: 20000 }); // Increased timeout
                                articleHtml = articleResponse.data;
                            }

                            if (!articleHtml) {
                                throw new Error("Full article content fetch returned empty.");
                            }

                            const article$ = cheerio.load(articleHtml);
                            let processedArticle$ = article$;

                            if (config.preprocess) {
                                try {
                                    processedArticle$ = config.preprocess(articleHtml, article$);
                                } catch (e) {
                                    console.error(`Error preprocessing full article page ${article.url}:`, e);
                                }
                            }

                            // More aggressive clutter removal on article page
                            processedArticle$('script, style, nav, footer, aside, header, [role="banner"], [role="navigation"], [role="complementary"], .ad, .advert, .related-links, .comments, figure, form, noscript, iframe, .social-links, .print-button, .cookie-banner, .subscription-prompt, .share-buttons, #sidebar, .author-bio, .video-player, noscript').remove();

                             // Select full content using dedicated selectors
                            const fullContentText = selectBest(processedArticle$('body'), config.selector.fullContent!, 'fullContent'); // Use 'fullContent' field type

                            const initialContentLength = article.content?.length || 0;
                            if (fullContentText && fullContentText.length > initialContentLength) {
                                // Use the fetched full content, apply cleaning and length cap
                                article.content = cleanContent(fullContentText).slice(0, 8000); // Increased cap
                                fetchedFullContent = true;
                                console.info(`Successfully fetched and updated full content for: ${article.url}. Initial length: ${initialContentLength}, Fetched length: ${fullContentText.length}, Final length: ${article.content.length}`);
                            } else if (fullContentText) {
                                 console.info(`Fetched full content for ${article.url} (Length: ${fullContentText.length}) was not longer than initial content (Length: ${initialContentLength}). Keeping initial content.`);
                                 // Optionally, still clean the initial content more aggressively
                                 article.content = cleanContent(article.content).slice(0, 8000);
                            } else {
                                console.warn(`Full content fetch for ${article.url} did not yield any text using selectors: ${config.selector.fullContent!.selectors.join(', ')}. Keeping initial content.`);
                                // Optionally, still clean the initial content more aggressively
                                 article.content = cleanContent(article.content).slice(0, 8000);
                            }
                        } catch (error) {
                            console.warn(`Failed to fetch or process full content for ${article.url}:`, { error: (error as Error).message });
                            // Fallback: Ensure existing content (summary) is cleaned and capped
                             article.content = cleanContent(article.content).slice(0, 8000);
                        }
                    });
               } else {
                   // If not fetching full article, ensure summary is cleaned and capped
                   article.content = cleanContent(article.summary).slice(0, 8000); // Use summary as content
               }


                // 7. Final Validation and Postprocessing
                 // Use a more lenient check, ensuring *some* content exists
                 if (!article.content || article.content.length < 20) {
                    console.warn(`Skipping article: Content too short or missing after fetch attempt. Length: ${article.content?.length ?? 0}. URL: ${article.url}`);
                    continue;
                 }

                let finalArticle = article as NewsArticle;
                if (config.postprocess) {
                    try {
                        finalArticle = config.postprocess(finalArticle);
                    } catch (e) {
                        console.error(`Error during postprocessing for ${finalArticle.url}:`, e);
                    }
                }

              // 8. Add to list and mark URL as seen
              articles.push(finalArticle);
              seenUrls.add(finalArticle.url);
              console.info(`Successfully scraped article: "${finalArticle.title.substring(0, 50)}..." from ${finalArticle.source}`);


         } catch (error) {
           console.error(`Error processing a potential article element from ${config.sourceName}:`, { error: (error as Error).message, elementHtml: $(element).html()?.substring(0, 100) });
         }

         // Optional small delay between processing elements on the main page
         await wait(50); // Small delay to be less aggressive

    } // End of article element loop

    console.info(`Finished scraping ${config.sourceName}. Found ${articles.length} valid articles.`);
    return articles; // Return collected articles (limit already applied)

  } catch (error) {
    console.error(`Major error scraping ${config.sourceName} (${config.url}):`, { error: (error as Error).message, stack: (error as Error).stack });
    return []; // Return empty array on significant failure
  }
}

// --- Server Action ---

/**
 * Server Action to scrape news articles, generate summaries, and store in Firebase.
 * @param sources Array of news source names (keys in scrapingConfig) or direct URLs.
 * @param limit Maximum articles per source to process.
 * @param concurrency Maximum concurrent scraping/processing tasks.
 * @returns ScrapeResult object.
 */
export async function scrapeAndStoreArticles(
  sources: string[],
  limit: number,
  concurrency: number = 5 // Overall concurrency limit for the action
): Promise<ScrapeResult> {
  const startTime = Date.now();
  let processedCount = 0;
  let totalArticlesScraped = 0;
  const allErrors: { source: string; message: string, url?: string }[] = [];
  const overallLimit = pLimit(concurrency); // Controls concurrent source scraping AND article processing

  console.info(`--- Starting scrapeAndStoreArticles --- Sources: [${sources.join(', ')}], Limit per source: ${limit}, Concurrency: ${concurrency}`);

  const scrapingPromises = sources.map((source) =>
    overallLimit(async () => {
      const sourceStartTime = Date.now();
      try {
          // Perform scraping for the source
          const subConcurrency = Math.max(1, Math.floor(concurrency / sources.length));
          const articles = await performScraping(source, limit, subConcurrency);
          totalArticlesScraped += articles.length;
          console.info(`Source ${source}: Scraped ${articles.length} articles in ${Date.now() - sourceStartTime}ms.`);


          // Process each scraped article (summarize and store)
          const processingPromises = articles.map((article) =>
            overallLimit(async () => {
              const articleProcessStart = Date.now();
              try {
                // 1. Generate summary using Genkit flow (using the potentially longer 'content' field)
                console.debug(`Summarizing article: ${article.url} (Content length: ${article.content.length})`);
                const { script } = await summarizeArticle({ content: article.content });
                console.debug(`Summarized article: ${article.url} in ${Date.now() - articleProcessStart}ms`);

                // 2. Prepare data for storage
                 const articleId = encodeBase64UrlSafe(article.url);

                // Store both summary (if available) and the main content
                const dataToStore: StoredArticleData = {
                  title: article.title,
                  url: article.url,
                  source: article.source,
                  content: article.content, // The main (potentially full) content
                  summary: article.summary, // The initial summary/teaser
                  imageUrl: article.imageUrl,
                  publishedDate: article.publishedDate,
                  generatedScript: script,
                };

                // 3. Store article data in Firebase Storage
                console.debug(`Storing article: ${articleId} (URL: ${article.url})`);
                await storeArticle(articleId, dataToStore);
                processedCount++;
                console.info(`Successfully processed and stored article: ${article.url} in ${Date.now() - articleProcessStart}ms`);

              } catch (error) {
                const errorMsg = `Error processing article "${article.title}" (${article.url}): ${(error as Error).message}`;
                console.error(errorMsg, { stack: (error as Error).stack });
                allErrors.push({ source: article.source, message: errorMsg, url: article.url });
              }
            })
          ); // End map for processingPromises

          await Promise.all(processingPromises);
          console.info(`Source ${source}: Finished processing ${articles.length} scraped articles.`);

      } catch (error) {
        // Catch errors from performScraping itself
        const errorMsg = `Error during scraping phase for source ${source}: ${(error as Error).message}`;
        console.error(errorMsg, { stack: (error as Error).stack });
        allErrors.push({ source: source, message: errorMsg });
      }
    }) // End overallLimit wrapper for source
  ); // End map for scrapingPromises

  // Wait for all sources and their article processing to complete
  await Promise.all(scrapingPromises);

  const durationMs = Date.now() - startTime;
  const successRate = totalArticlesScraped > 0 ? processedCount / totalArticlesScraped : (sources.length > 0 ? 0 : 1); // Avoid division by zero

  console.info(`--- Finished scrapeAndStoreArticles --- Duration: ${durationMs}ms, Processed: ${processedCount}, Scraped: ${totalArticlesScraped}, Errors: ${allErrors.length}`);
   if (allErrors.length > 0) {
       console.warn("Errors occurred during scraping/processing:", allErrors);
   }


  return {
    success: allErrors.length === 0, // Consider success only if NO errors occurred during processing
    processedCount,
    sourcesAttempted: sources.length,
    articlesScraped: totalArticlesScraped,
    errors: allErrors.map(e => `[${e.source}] ${e.message}${e.url ? ` (URL: ${e.url})` : ''}`), // Format errors for output
    metrics: {
      durationMs,
      successRate: Math.min(1, successRate), // Ensure rate is max 1
    },
  };
}

// Optional: Add a function to fetch a single article's full content on demand
// export async function fetchFullArticleContent(url: string): Promise<string | null> { ... }
