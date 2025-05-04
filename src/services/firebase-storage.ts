import { storage } from './firebase-config';
import { ref, uploadString, getDownloadURL, deleteObject, listAll, StorageReference } from 'firebase/storage';
import type { NewsArticle } from './news-scraper.interface'; // Renamed interface file

/*
 * =============================================================================
 * CRITICAL: CORS Configuration for Firebase Storage (Resolving Fetch Errors)
 * =============================================================================
 * If you are seeing "Failed to fetch" errors in the browser console when trying
 * to load articles (specifically from the `getArticle` or `getAllStoredArticles`
 * functions calling `fetch(url)`), it is almost certainly due to missing or
 * incorrect CORS (Cross-Origin Resource Sharing) configuration on your
 * Firebase Storage bucket (which is a Google Cloud Storage bucket).
 *
 * Browsers enforce the Same-Origin Policy, preventing web pages from making
 * requests to a different domain (like `firebasestorage.googleapis.com`) unless
 * that domain explicitly allows it via CORS headers.
 *
 * You MUST configure your bucket to allow GET requests from your web app's origin(s).
 *
 * How to configure CORS using gsutil (Recommended):
 *
 * 1. Install gsutil:
 *    Follow the instructions: https://cloud.google.com/storage/docs/gsutil_install
 *
 * 2. Create a CORS configuration file (e.g., `cors-config.json`):
 *    Replace `http://localhost:9002` with your actual local development port if different.
 *    Replace `https://your-production-app-domain.com` with your deployed application's URL.
 *    You can add multiple origins to the array.
 *
 *    ```json
 *    [
 *      {
 *        "origin": ["http://localhost:9002", "https://your-production-app-domain.com"],
 *        "method": ["GET"],
 *        "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
 *        "maxAgeSeconds": 3600
 *      }
 *    ]
 *    ```
 *
 * 3. Apply the configuration to your bucket:
 *    Replace `<YOUR_STORAGE_BUCKET_NAME>` with your actual bucket name (from your .env file, e.g., `your-project-id.appspot.com`).
 *
 *    ```bash
 *    gsutil cors set cors-config.json gs://<YOUR_STORAGE_BUCKET_NAME>
 *    ```
 *
 * 4. Verify the configuration:
 *    ```bash
 *    gsutil cors get gs://<YOUR_STORAGE_BUCKET_NAME>
 *    ```
 *
 * Alternative: Using Google Cloud Console (Less Recommended for complex configs):
 *    a. Go to Cloud Storage -> Buckets in the Google Cloud Console.
 *    b. Select your project's bucket.
 *    c. Go to the "Permissions" tab, then "Edit access".
 *    d. Find the CORS section (you might need to click "Add entry" or similar).
 *    e. Add your origin(s) (e.g., `http://localhost:9002`).
 *    f. Select the `GET` method.
 *    g. Set `maxAgeSeconds` (e.g., 3600).
 *    h. Save the configuration.
 *
 * IMPORTANT NOTES:
 *  - It might take a few minutes for CORS changes to propagate. Clear your browser cache if issues persist after configuration.
 *  - Ensure the `origin` in your `cors-config.json` EXACTLY matches the origin shown in the browser's address bar (including `http` or `https` and the port number for local development).
 *  - The error "Response to preflight request doesn't pass access control check: It does not have HTTP ok status" also indicates a CORS problem. The `fetch` might be preceded by an `OPTIONS` request (preflight) which also needs to be allowed by the CORS policy if headers other than simple ones are involved, though for simple GET requests, the configuration above should suffice.
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
    let url: string;
    try {
         url = await getDownloadURL(storageRef);
    } catch (error: any) {
         // Catch storage/object-not-found specifically from getDownloadURL
         if (error.code === 'storage/object-not-found') {
             console.warn(`Article ${articleId} not found directly in storage.`);
             throw new Error(`Article not found.`); // Re-throw specific error
         }
         console.error(`Error getting download URL for article ${articleId}:`, error);
         throw new Error(`Failed to get download URL: ${error.message || 'Unknown error'}`);
    }

    try {
        // Use fetch to get the content from the URL
        // *** CORS ERROR LIKELY HAPPENS HERE ***
        // If fetch fails with "TypeError: Failed to fetch" or a CORS error,
        // check the CORS configuration on your Firebase Storage bucket. See comment block above.
        const response = await fetch(url);

        if (!response.ok) {
            // Throw specific error for easier handling upstream
             if (response.status === 404) {
                 console.warn(`Article ${articleId} JSON file not found at URL: ${url}`);
                 throw new Error(`Article not found.`);
             }
            // Log the URL that failed
            console.error(`HTTP error fetching article JSON! Status: ${response.status} for URL: ${url}`);
            throw new Error(`HTTP error fetching article JSON! status: ${response.status}`);
        }
        const data: StoredArticleData = await response.json();
        console.log(`Article ${articleId} retrieved successfully.`);
        return data;
    } catch (error: any) {
        // Catch potential fetch errors (NetworkError, CORS issues)
        console.error(`Error fetching article content for ${articleId} from ${url}:`, error);
        // Provide a more user-friendly error message, hinting at CORS
        throw new Error(`Failed to fetch article data for ${articleId}. This might be a network issue or a CORS configuration problem on the storage bucket. Check browser console and CORS settings. Original error: ${error.message || 'Unknown fetch error'}`);
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
    console.log("Listing articles from:", listRef.fullPath); // Log which folder is being listed

    try {
        const res = await listAll(listRef);
        console.log(`Found ${res.items.length} items in the articles folder.`); // Log how many items were found

        const fetchPromises = res.items
            .filter(itemRef => itemRef.name.endsWith('.json')) // Ensure we only process JSON files
            .map(async (itemRef: StorageReference) => {
                try {
                    // Extract articleId from the file name (remove .json extension)
                    const articleId = itemRef.name.replace(/\.json$/, '');
                    // IMPORTANT: This calls getArticle, which performs a fetch.
                    // If CORS is not configured, this fetch will likely fail.
                    return await getArticle(articleId);
                } catch (error) {
                    // Log specific errors for each article that fails
                    console.error(`Error fetching article content for ${itemRef.name}:`, error);
                    // Return null or some indicator that this specific article failed
                    // This prevents one failed article from crashing the entire list load.
                    return null;
                }
            });

        const results = await Promise.all(fetchPromises);

        // Filter out any null results from failed fetches and log counts
        const successfulArticles = results.filter((article): article is StoredArticleData => article !== null);
        const failedCount = results.length - successfulArticles.length;
        if (failedCount > 0) {
             console.warn(`Failed to fetch content for ${failedCount} articles. Check previous logs and CORS configuration.`);
        }
         console.log(`Successfully processed ${successfulArticles.length} articles.`);
        return successfulArticles;

    } catch (error) {
        // This error would likely be from listAll itself (e.g., permissions)
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
