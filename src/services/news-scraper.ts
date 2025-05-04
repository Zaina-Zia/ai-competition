/**
 * Represents a news article.
 */
export interface NewsArticle {
  /**
   * The title of the article.
   */
  title: string;
  /**
   * The URL of the article.
   */
  url: string;
  /**
   * The source of the article (e.g., BBC, New York Times).
   */
  source: string;
  /**
   * The content/summary of the article.
   */
  content: string;
  /**
   * The URL of the article's image.
   */
  imageUrl?: string; // Make imageUrl optional
   /**
    * The generated news script. Optional, added after AI processing.
    */
   generatedScript?: string;
}

// Placeholder data - replace with actual scraping logic or API calls in a real backend.
const placeholderData: { [key: string]: NewsArticle[] } = {
  'BBC': [
    { title: 'Global Summit Addresses Climate Change Urgently', url: 'https://www.bbc.com/news/world-1', source: 'BBC', content: 'World leaders gathered today for an emergency summit focusing on accelerating climate action...', imageUrl: 'https://picsum.photos/seed/bbc1/400/300' },
    { title: 'Tech Giant Unveils Revolutionary AI Assistant', url: 'https://www.bbc.com/news/technology-2', source: 'BBC', content: 'A major technology company today revealed its latest innovation, an AI assistant promising to redefine user interaction...', imageUrl: 'https://picsum.photos/seed/bbc2/400/300' },
    { title: 'Breakthrough in Renewable Energy Storage', url: 'https://www.bbc.com/news/science-3', source: 'BBC', content: 'Scientists announce a significant advancement in battery technology, potentially solving key challenges for renewable energy...', imageUrl: 'https://picsum.photos/seed/bbc3/400/300' },
  ],
  'New York Times': [
    { title: 'Economic Indicators Show Mixed Signals Amid Inflation Fears', url: 'https://www.nytimes.com/news/economy-1', source: 'New York Times', content: 'The latest economic reports present a complex picture, with job growth remaining strong but inflation concerns persisting...', imageUrl: 'https://picsum.photos/seed/nyt1/400/300' },
    { title: 'Political Tensions Rise Ahead of Midterm Elections', url: 'https://www.nytimes.com/news/politics-2', source: 'New York Times', content: 'With midterm elections approaching, political rhetoric intensifies as parties vie for control...', imageUrl: 'https://picsum.photos/seed/nyt2/400/300' },
  ],
  'Reuters': [
    { title: 'Supply Chain Disruptions Continue to Impact Global Trade', url: 'https://www.reuters.com/news/business-1', source: 'Reuters', content: 'Experts report that ongoing supply chain issues are still affecting international trade routes and consumer prices...', imageUrl: 'https://picsum.photos/seed/reuters1/400/300' },
  ],
  'Associated Press': [
     { title: 'Major Sporting Event Concludes with Dramatic Finish', url: 'https://apnews.com/news/sports-1', source: 'Associated Press', content: 'The championship game ended in a nail-biting finish, decided in the final seconds...', imageUrl: 'https://picsum.photos/seed/ap1/400/300'},
  ],
   'Al Jazeera': [
     { title: 'Humanitarian Crisis Deepens in Conflict Zone', url: 'https://www.aljazeera.com/news/world-conflict-1', source: 'Al Jazeera', content: 'Aid organizations issue urgent appeals as the humanitarian situation worsens in the war-torn region...', imageUrl: 'https://picsum.photos/seed/aj1/400/300'},
   ]
};


/**
 * Asynchronously simulates scraping news articles from a given source.
 * In a real application, this function would live on a server/backend
 * and perform actual web scraping or call news APIs.
 *
 * @param source The news source to "scrape" (e.g., 'BBC', 'New York Times').
 * @returns A promise that resolves to an array of NewsArticle objects for that source.
 */
export async function scrapeNews(source: string): Promise<NewsArticle[]> {
  console.log(`Simulating scraping for source: ${source}`);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500)); // 0.5-1.5 seconds delay

  // Simulate potential error
  // if (Math.random() < 0.1 && source === 'Reuters') { // 10% chance of error for Reuters
  //   console.error(`Simulated scraping error for ${source}`);
  //   throw new Error(`Failed to scrape ${source}. Network timeout.`);
  // }

  const articles = placeholderData[source] || [];

   // Add unique IDs based on URL (simple example)
   return articles.map(article => ({
     ...article,
     // Ensure unique URL for key prop later
     url: `${article.url}-${Math.random().toString(36).substring(7)}`
   }));
}
