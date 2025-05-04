import { storage } from './firebase-config';
import { ref, uploadString, getDownloadURL, deleteObject, listAll, StorageReference } from 'firebase/storage';
import type { NewsArticle } from './news-scraper.interface'; // Use updated interface
import { encodeBase64UrlSafe, decodeBase64UrlSafe } from '@/lib/utils'; // Import helpers

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
 * requests to a different domain (like `firebasestorage.googleapis.com` or your
 * project-specific storage domain) unless that domain explicitly allows it via
 * CORS headers.
 *
 * You MUST configure your bucket to allow GET requests from your web app's origin(s).
 *
 * How to configure CORS using gsutil (Recommended):
 *
 * 1. Install gsutil:
 *    Follow the instructions: https://cloud.google.com/storage/docs/gsutil_install
 *
 * 2. Create a CORS configuration file (e.g., `cors-config.json`):
 *    Replace `http://localhost:9000` / `https://*.cloudworkstations.dev` / etc. with your actual origins.
 *    You can add multiple origins to the array.
 *    Using wildcards like `*.cloudworkstations.dev` is possible but be mindful of security implications.
 *
 *    ```json
 *    [
 *      {
 *        "origin": [
 *           "http://localhost:9000", // Local dev
 *           "https://9000-idx-studio-1746337412493.cluster-w5vd22whf5gmav2vgkomwtc4go.cloudworkstations.dev", // Specific dev URL
 *           "https://*.cloudworkstations.dev", // Wider match for dev environments
 *           "https://your-production-app-domain.com" // Add production domain here
 *         ],
 *        "method": ["GET"],
 *        "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
 *        "maxAgeSeconds": 3600
 *      }
 *    ]
 *    ```
 *
 * 3. Apply the configuration to your bucket:
 *    Replace `<YOUR_STORAGE_BUCKET_URL>` with your actual bucket URL (e.g., `gs://newscast-now.appspot.com`).
 *
 *    ```bash
 *    gsutil cors set cors-config.json gs://newscast-now.appspot.com
 *    ```
 *
 * 4. Verify the configuration:
 *    ```bash
 *    gsutil cors get gs://newscast-now.appspot.com
 *    ```
 *
 * Alternative: Using Google Cloud Console (Less Recommended for complex configs):
 *    a. Go to Cloud Storage -> Buckets in the Google Cloud Console.
 *    b. Select your project's bucket (`newscast-now.appspot.com`).
 *    c. Go to the "Permissions" tab.
 *    d. Click "Edit access" or find the CORS configuration section.
 *    e. Add your origin(s) (e.g., `http://localhost:9000`, your cloud workstation URL).
 *    f. Select the `GET` method.
 *    g. Set `responseHeader` to include `Content-Type` and `Access-Control-Allow-Origin`.
 *    h. Set `maxAgeSeconds` (e.g., 3600).
 *    i. Save the configuration.
 *
 * IMPORTANT NOTES:
 *  - It might take a few minutes for CORS changes to propagate. Clear your browser cache and restart your dev server if issues persist after configuration.
 *  - Ensure the `origin` in your `cors-config.json` EXACTLY matches the origin shown in the browser's address bar (including `http` or `https` and the port number for local development).
 *  - The error "Response to preflight request doesn't pass access control check: It does not have HTTP ok status" also indicates a CORS problem. The `fetch` might be preceded by an `OPTIONS` request (preflight) which also needs to be allowed by the CORS policy if headers other than simple ones are involved. Adding `"method": ["GET", "OPTIONS"]` might be necessary in some cases, but usually just `GET` is sufficient for fetching files.
 *
 * For more details, see:
 * https://firebase.google.com/docs/storage/web/download-files#cors_configuration
 * https://cloud.google.com/storage/docs/configuring-cors
 * =============================================================================
 */


// Represents the data structure as stored in Firebase Storage.
// It extends the base NewsArticle with the AI-generated script.
export interface StoredArticleData extends NewsArticle {
    generatedScript?: string;
    // Add any other metadata specific to storage if needed
    storedAt?: string; // Example: ISO timestamp of when it was stored
}

const ARTICLES_FOLDER = 'articles';

/**
 * Stores the article data (including the generated script) as a JSON file in Firebase Storage.
 * Uses URL-safe base64 encoding of the URL for a unique filename.
 *
 * @param articleId The **URL-safe base64 encoded** unique identifier derived from the article URL.
 * @param data The article data including the generated script.
 * @returns A promise that resolves when the upload is complete.
 */
export async function storeArticle(articleId: string, data: StoredArticleData): Promise<void> {
    // Add a timestamp to the stored data
    const dataWithTimestamp = { ...data, storedAt: new Date().toISOString() };
    const storageRef = ref(storage, `${ARTICLES_FOLDER}/${articleId}.json`);
    const dataString = JSON.stringify(dataWithTimestamp); // Store the enriched data
    try {
        await uploadString(storageRef, dataString, 'raw', {
            contentType: 'application/json'
        });
        console.info(`Article ${articleId} (URL: ${data.url}) stored successfully.`);
    } catch (error) {
        console.error(`Error storing article ${articleId} (URL: ${data.url}):`, error);
        throw new Error(`Failed to store article data: ${(error as Error).message}`);
    }
}

/**
 * Retrieves the article data (including the generated script) from Firebase Storage.
 *
 * @param articleId The **URL-safe base64 encoded** unique identifier for the article.
 * @returns A promise that resolves to the StoredArticleData.
 */
export async function getArticle(articleId: string): Promise<StoredArticleData> {
    const storageRef = ref(storage, `${ARTICLES_FOLDER}/${articleId}.json`);
    let url: string;
    try {
         // Get the download URL. This requires public access or authentication.
         // Note: Includes `alt=media` for direct download, which is often needed for fetch.
         url = await getDownloadURL(storageRef);
         console.debug(`Download URL obtained for ${articleId}: ${url}`);
    } catch (error: any) {
         // Catch storage/object-not-found specifically from getDownloadURL
         if (error.code === 'storage/object-not-found') {
             console.warn(`Article JSON file for ID ${articleId} not found in storage.`);
             throw new Error(`Article not found.`); // Re-throw specific error
         }
         console.error(`Error getting download URL for article ID ${articleId}:`, error);
         throw new Error(`Failed to get download URL: ${error.message || 'Unknown error'}`);
    }

    try {
        // Use fetch to get the content from the URL
        // *** CORS ERROR LIKELY HAPPENS HERE ***
        // If fetch fails with "TypeError: Failed to fetch" or a CORS error,
        // check the CORS configuration on your Firebase Storage bucket. See comment block above.
        console.debug(`Fetching article content from URL: ${url}`);
        const response = await fetch(url); // Default mode is 'cors'

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
        console.info(`Article ${articleId} retrieved successfully.`);
        // Basic validation of expected fields
        if (!data.title || !data.url || !data.source || !data.content) { // Check for content now
             console.warn(`Retrieved data for article ID ${articleId} is missing required fields (title, url, source, content).`);
             // Depending on strictness, you might throw an error here
        }

        return data;
    } catch (error: any) {
        // Catch potential fetch errors (NetworkError, CORS issues, JSON parsing errors)
        console.error(`Error fetching article content for ${articleId} from ${url}:`, error);

        // Provide a more user-friendly error message, hinting at CORS
        let errorMessage = `Failed to fetch article data for ${articleId}. This might be a network issue or a CORS configuration problem on the storage bucket. Check browser console and CORS settings.`;
         if (error instanceof TypeError && error.message.includes('Failed to fetch')) { // Check includes for more robustness
            errorMessage += ' The error suggests a possible CORS issue. Verify that the origin of your application is in the allowed origins in the Firebase Storage CORS configuration.';
         } else if (error instanceof SyntaxError) {
             // JSON parsing error
             errorMessage += ' The retrieved file is not valid JSON.';
         }
         errorMessage += ` Original error: ${error.message || 'Unknown fetch error'}`;
        throw new Error(errorMessage);
    }
}

/**
 * Retrieves all article data stored in the articles folder.
 * Fetches download URLs first, then fetches content concurrently.
 * Handles individual fetch errors gracefully.
 *
 * @returns A promise that resolves to an array of StoredArticleData.
 */
export async function getAllStoredArticles(): Promise<StoredArticleData[]> {
    const listRef = ref(storage, ARTICLES_FOLDER);
    console.info(`Listing articles from storage path: ${listRef.fullPath}`);

    try {
        const res = await listAll(listRef);
        const jsonFiles = res.items.filter(itemRef => itemRef.name.endsWith('.json'));
        console.info(`Found ${jsonFiles.length} JSON files in the articles folder.`);

        if (jsonFiles.length === 0) {
            return []; // No articles found
        }

        const fetchPromises = jsonFiles.map(async (itemRef: StorageReference) => {
            // Extract articleId from the file name (remove .json extension)
            const articleId = itemRef.name.replace(/\.json$/, '');
            try {
                // IMPORTANT: This calls getArticle, which performs a fetch.
                // If CORS is not configured, this fetch will likely fail.
                return await getArticle(articleId);
            } catch (error) {
                // Log specific errors for each article that fails
                console.error(`Failed to get/process article with ID ${articleId} (${itemRef.name}):`, error);
                // Return null to indicate failure for this specific article
                // This prevents one failed article from crashing the entire list load.
                return null;
            }
        });

        const results = await Promise.all(fetchPromises);

        // Filter out any null results from failed fetches and log counts
        const successfulArticles = results.filter((article): article is StoredArticleData => article !== null);
        const failedCount = results.length - successfulArticles.length;
        if (failedCount > 0) {
             console.warn(`Failed to fetch content for ${failedCount} out of ${results.length} articles. Check previous logs and CORS configuration.`);
        }
         console.info(`Successfully processed and retrieved ${successfulArticles.length} articles.`);
        return successfulArticles;

    } catch (error) {
        // This error would likely be from listAll itself (e.g., permissions error)
        console.error("Error listing articles in storage:", error);
        throw new Error(`Failed to list articles: ${(error as Error).message}`);
    }
}


/**
 * Deletes an article's data from Firebase Storage.
 *
 * @param articleId The **URL-safe base64 encoded** unique identifier for the article.
 * @returns A promise that resolves when the deletion is complete.
 */
export async function deleteArticle(articleId: string): Promise<void> {
    const storageRef = ref(storage, `${ARTICLES_FOLDER}/${articleId}.json`);
    try {
        await deleteObject(storageRef);
        console.info(`Article ${articleId} deleted successfully.`);
    } catch (error: any) {
         if (error.code === 'storage/object-not-found') {
             console.warn(`Attempted to delete non-existent article ${articleId}.`);
             return; // Don't throw an error if it's already gone
         }
        console.error(`Error deleting article ${articleId}:`, error);
        throw new Error(`Failed to delete article data: ${error.message}`);
    }
}
