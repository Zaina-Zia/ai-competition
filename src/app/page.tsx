import { NewsFeed } from '@/components/news-feed';
// Removed Avatar import and usage from here

export default function Home() {
  // Render only the NewsFeed component on the main page
  return <NewsFeed />;
}
