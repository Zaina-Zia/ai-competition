/**
 * Represents a news article.
 */
export interface NewsArticle {
  /**
   * The title of the article.
   */
  title: string;
  /**
   * The URL of the article. Should be unique.
   */
  url: string;
  /**
   * The source of the article (e.g., 'BBC', 'New York Times').
   */
  source: string;
  /**
   * The main content/body of the article.
   */
  content: string;
  /**
   * The URL of the article's primary image, if available.
   */
  imageUrl?: string;
   /**
    * The generated news script. Optional, added after AI processing.
    */
   generatedScript?: string;
}
