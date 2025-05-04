import { storage } from './firebase-config';
import { ref, uploadString, getDownloadURL, deleteObject, listAll, StorageReference } from 'firebase/storage';
import type { NewsArticle } from './news-scraper.interface'; // Renamed interface file

/*
 * =============================================================================
 * IMPORTANT: CORS Configuration for Firebase Storage
 * =============================================================================
 * If you encounter CORS errors when fetching data from Firebase Storage
 * (e.g., "Response to preflight request doesn't pass access control check"),
 * you need to configure CORS on your Google Cloud Storage bucket.
 *
 * Firebase Storage uses Google Cloud Storage buckets. You need to allow
 * requests from your web application's origin (e.g., https://your-app-domain.com
 * or http://localhost:port for development).
 *
 * How to configure CORS:
 * 1. Using gsutil (Command Line Tool):
 *    a. Create a JSON file (e.g., `cors-config.json`) with the following content:
 *       [
 *         {
 *           "origin": ["http://localhost:9002", "https://your-production-app-domain.com"], // Add your dev and prod origins
 *           "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
 *           "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
 *           "maxAgeSeconds": 3600
 *         }
 *       ]
 *    b. Run the command:
 *       gsutil cors set cors-config.json gs://<YOUR_STORAGE_BUCKET_NAME>
 *       (Replace <YOUR_STORAGE_BUCKET_NAME> with your bucket name from firebaseConfig.storageBucket)
 *
 * 2. Using Google Cloud Console:
 *    a. Go to Cloud Storage -> Buckets in the Google Cloud Console.
 *    b. Select your project's bucket.
 *    c. Go to the "Permissions" tab.
 *    d. Click "Edit bucket permissions" or find the CORS section.
 *    e. Add your origins (e.g., http://localhost:9002) to the allowed origins list, specify methods (GET, etc.), and save.
 *
 * For more details, see:
 * https://firebase.google.com/docs/storage/web/download-files#cors_configuration
 * https://cloud.google.com/storage/docs/configuring-cors
 * =============================================================================
 */


export interface StoredArticleData extends NewsArticle {
    generatedScript?: string; // Add the generated script
}

const ARTICLES_FOLDER = 'articles';

/**
 * Stores the article data (including the generated script) as a JSON file in Firebase Storage.
 *
 * @param articleId A unique identifier for the article (e.g., encoded URL or UUID).
 * @param data The article data including the generated script.
 * @returns A promise that resolves when the upload is complete.
 */
export async function storeArticle(articleId: string, data: StoredArticleData): Promise<void> {
    const storageRef = ref(storage, `${ARTICLES_FOLDER}/${articleId}.json`);
    const dataString = JSON.stringify(data);
    try {
        await uploadString(storageRef, dataString, 'raw', {
            contentType: 'application/json'
        });
        console.log(`Article ${articleId} stored successfully.`);
    } catch (error) {
        console.error(`Error storing article ${articleId}:`, error);
        throw new Error(`Failed to store article data: ${(error as Error).message}`);
    }
}

/**
 * Retrieves the article data (including the generated script) from Firebase Storage.
 *
 * @param articleId The unique identifier for the article.
 * @returns A promise that resolves to the StoredArticleData.
 */
export async function getArticle(articleId: string): Promise<StoredArticleData> {
    const storageRef = ref(storage, `${ARTICLES_FOLDER}/${articleId}.json`);
    try {
        const url = await getDownloadURL(storageRef);
        // Use fetch to get the content from the URL
        const response = await fetch(url);
        if (!response.ok) {
            // Throw specific error for easier handling upstream
             if (response.status === 404) {
                 console.warn(`Article ${articleId} JSON file not found at URL: ${url}`);
                 throw new Error(`Article not found.`);
             }
            throw new Error(`HTTP error fetching article JSON! status: ${response.status} for ${url}`);
        }
        const data: StoredArticleData = await response.json();
        console.log(`Article ${articleId} retrieved successfully.`);
        return data;
    } catch (error: any) {
         // Catch storage/object-not-found specifically from getDownloadURL if fetch fails before 404
         if (error.code === 'storage/object-not-found') {
             console.warn(`Article ${articleId} not found directly in storage.`);
             throw new Error(`Article not found.`);
         }
         // Re-throw other errors
        console.error(`Error retrieving article ${articleId}:`, error);
        // Make error message more specific if possible
        throw new Error(`Failed to retrieve article data: ${error.message || 'Unknown error'}`);
    }
}

/**
 * Retrieves all article data stored in the articles folder.
 * Note: This can be inefficient for very large numbers of articles.
 * Consider using Firestore or another database for querying metadata if scale is large.
 * This function should ideally be called from a server-side context (like a Server Action)
 * due to potential performance implications and broader permissions needed for listing.
 *
 * @returns A promise that resolves to an array of StoredArticleData.
 */
export async function getAllStoredArticles(): Promise<StoredArticleData[]> {
    const listRef = ref(storage, ARTICLES_FOLDER);
    const articles: StoredArticleData[] = [];

    try {
        const res = await listAll(listRef);
        const fetchPromises = res.items
            .filter(itemRef => itemRef.name.endsWith('.json')) // Ensure we only process JSON files
            .map(async (itemRef: StorageReference) => {
                try {
                    // Extract articleId from the file name (remove .json extension)
                    const articleId = itemRef.name.replace(/\.json$/, '');
                    return await getArticle(articleId);
                } catch (error) {
                    console.error(`Error fetching article ${itemRef.fullPath}:`, error);
                    return null; // Return null for articles that fail to fetch
                }
            });

        const results = await Promise.all(fetchPromises);
        // Filter out any null results from failed fetches
        return results.filter((article): article is StoredArticleData => article !== null);

    } catch (error) {
        console.error("Error listing articles in storage:", error);
        throw new Error(`Failed to list articles: ${(error as Error).message}`);
    }
}


/**
 * Deletes an article's data from Firebase Storage.
 *
 * @param articleId The unique identifier for the article.
 * @returns A promise that resolves when the deletion is complete.
 */
export async function deleteArticle(articleId: string): Promise<void> {
    const storageRef = ref(storage, `${ARTICLES_FOLDER}/${articleId}.json`);
    try {
        await deleteObject(storageRef);
        console.log(`Article ${articleId} deleted successfully.`);
    } catch (error: any) {
         if (error.code === 'storage/object-not-found') {
             console.warn(`Attempted to delete non-existent article ${articleId}.`);
             return; // Don't throw an error if it's already gone
         }
        console.error(`Error deleting article ${articleId}:`, error);
        throw new Error(`Failed to delete article data: ${error.message}`);
    }
}
