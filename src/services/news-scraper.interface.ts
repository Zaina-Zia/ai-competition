/**
 * Represents a news article scraped from a source.
 */
export interface NewsArticle {
  /**
   * The title of the article.
   */
  title: string;
  /**
   * The absolute URL of the article. Should be unique.
   */
  url: string;
  /**
   * The source of the article (e.g., 'BBC', 'New York Times'). Matches config keys.
   */
  source: string;
  /**
   * The main content/body of the article (intended to be the full text after fetching).
   */
  content: string;
  /**
    * The initial summary or teaser content scraped from the index page. Optional.
    */
  summary?: string;
  /**
   * The URL of the article's primary image, if available.
   */
  imageUrl?: string;
   /**
    * The raw extracted publication date string, if available.
    * Format may vary depending on the source.
    */
   publishedDate?: string;
   // Note: generatedScript is added in StoredArticleData in firebase-storage.ts
}
