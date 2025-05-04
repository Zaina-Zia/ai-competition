import { storage } from './firebase-config';
import { ref, uploadString, getDownloadURL, deleteObject, listAll, StorageReference } from 'firebase/storage';
import type { NewsArticle } from './news-scraper.interface'; // Use updated interface
import { encodeBase64UrlSafe, decodeBase64UrlSafe } from '@/lib/utils'; // Import helpers

/*
 * =============================================================================
 * CRITICAL: CORS Configuration for Firebase Storage (Resolving Fetch/List Errors)
 * =============================================================================
 * If you are seeing "Failed to fetch", "Response to preflight request doesn't pass access control check",
 * or similar CORS errors in the browser console when trying to load or list articles
 * (specifically from `getArticle`, `getAllStoredArticles`, or `listAll`), it is almost certainly
 * due to missing or incorrect CORS configuration on your Firebase Storage bucket.
 *
 * Browsers enforce the Same-Origin Policy, preventing web pages from making
 * requests to a different domain (like `firebasestorage.googleapis.com`) unless that domain
 * explicitly allows it via CORS headers.
 *
 * **Crucially, operations like `listAll` often trigger a preflight `OPTIONS` request before the actual `GET` request.**
 * Your bucket MUST be configured to allow both `GET` and `OPTIONS` methods from your web app's origin(s).
 *
 * How to configure CORS using gsutil (Recommended):
 *
 * 1. Install gsutil:
 *    Follow the instructions: https://cloud.google.com/storage/docs/gsutil_install
 *
 * 2. Create a CORS configuration file (e.g., `cors-config.json`):
 *    Replace origin URLs with your actual origins (local dev, cloud workstation, production).
 *    Using wildcards like `*.cloudworkstations.dev` is possible but less secure for production.
 *
 *    ```json
 *    [
 *      {
 *        "origin": [
 *           "http://localhost:9000", // Local dev (replace port if different)
 *           "https://6000-idx-studio-1746337412493.cluster-w5vd22whf5gmav2vgkomwtc4go.cloudworkstations.dev", // Specific dev URL
 *           "https://*.cloudworkstations.dev", // Wider match for dev environments
 *           "https://your-production-app-domain.com" // Add production domain here
 *         ],
 *        "method": ["GET", "OPTIONS"], // *** MUST include OPTIONS for listAll ***
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
 *    c. Go to the "Permissions" tab, then "Edit access".
 *    d. Under CORS configuration, add your origin(s).
 *    e. Select BOTH `GET` and `OPTIONS` methods.
 *    f. Add `Content-Type` and `Access-Control-Allow-Origin` to `responseHeader`.
 *    g. Set `maxAgeSeconds` (e.g., 3600).
 *    h. Save the configuration.
 *
 * IMPORTANT NOTES:
 *  - It might take a few minutes for CORS changes to propagate. Clear browser cache/hard reload.
 *  - Ensure the `origin` in `cors-config.json` EXACTLY matches the origin in the browser's address bar.
 *  - The error "Response to preflight request doesn't pass access control check: It does not have HTTP ok status" specifically points to the `OPTIONS` request failing, reinforcing the need to allow it in the CORS config.
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
const FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout for individual fetches
const LIST_TIMEOUT_MS = 15000; // 15 seconds for listing files


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
        // *** CORS ERROR LIKELY HAPPENS HERE if GET is not allowed ***
        console.debug(`Fetching article content for ${articleId} from URL: ${url}`);
        const response = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) // Add timeout
        });

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
        // Catch potential fetch errors (NetworkError, CORS issues, JSON parsing errors)
        console.error(`Error fetching article content for ${articleId} from ${url}:`, error);

        // Provide a more user-friendly error message, hinting at CORS or Timeout
        let errorMessage = `Failed to fetch article data for ${articleId}. `;
         if (error.name === 'AbortError' || error.message.includes('timed out')) {
             errorMessage += `The request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds. Check network or increase timeout.`;
         } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) { // Check includes for more robustness
            errorMessage += 'This might be a network issue or a CORS configuration problem on the storage bucket (check GET allowed). Verify that the origin of your application is in the allowed origins in the Firebase Storage CORS configuration.';
         } else if (error instanceof SyntaxError) {
             // JSON parsing error
             errorMessage += ' The retrieved file is not valid JSON.';
         } else {
             errorMessage += 'Check browser console and CORS settings if applicable.'
         }
         errorMessage += ` Original error: ${error.message || 'Unknown fetch error'}`;
        throw new Error(errorMessage);
    }
}

/**
 * Retrieves all article data stored in the articles folder.
 * Fetches download URLs first, then fetches content concurrently.
 * Handles individual fetch errors and timeouts gracefully.
 *
 * @returns A promise that resolves to an array of StoredArticleData.
 */
export async function getAllStoredArticles(): Promise<StoredArticleData[]> {
    const listRef = ref(storage, ARTICLES_FOLDER);
    console.info(`Listing articles from storage path: ${listRef.fullPath}`);

    try {
        // *** CORS ERROR LIKELY HAPPENS HERE if OPTIONS is not allowed ***
        // listAll triggers a preflight OPTIONS request.
        const res = await listAll(listRef);
        const jsonFiles = res.items.filter(itemRef => itemRef.name.endsWith('.json'));
        console.info(`Found ${jsonFiles.length} JSON files in the articles folder.`);

        if (jsonFiles.length === 0) {
             console.warn('No article JSON files found in storage.');
             // Check if the folder actually exists or is empty.
             // If you just deleted the folder, this is expected.
             return []; // No articles found
        }

        const fetchPromises = jsonFiles.map(async (itemRef: StorageReference) => {
            // Extract articleId from the file name (remove .json extension)
            const articleId = itemRef.name.replace(/\.json$/, '');
            try {
                // Use Promise.race to add a timeout to the getArticle call
                const result = await Promise.race([
                    getArticle(articleId),
                    new Promise<null>((_, reject) =>
                        setTimeout(() => reject(new Error(`getArticle timed out for ${articleId}`)), FETCH_TIMEOUT_MS + 1000) // Slightly longer timeout for the race
                    ),
                ]);
                return result; // Will be null if the timeout occurred
            } catch (error) {
                // Log specific errors for each article that fails (including timeouts)
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
             console.warn(`Failed to fetch content for ${failedCount} out of ${results.length} articles due to errors or timeouts. Check previous logs and CORS configuration.`);
        }
         console.info(`Successfully processed and retrieved ${successfulArticles.length} articles.`);
        return successfulArticles;

    } catch (error: any) {
        // This error would likely be from listAll itself (e.g., permissions error, retry limit exceeded, CORS on OPTIONS)
         console.error("Error listing articles in storage:", error);

        let errorMessage = `Failed to list articles from '${ARTICLES_FOLDER}'. `;
        if (error.code === 'storage/retry-limit-exceeded') {
            errorMessage += `Max retry time exceeded. This might indicate network issues or problems reaching the storage service.`;
         } else if (error.code === 'storage/unknown' && error.message.includes('NetworkError') || (error instanceof TypeError && error.message.includes('Failed to fetch'))) {
             // This specific error pattern often indicates a CORS failure on the OPTIONS preflight request for listAll.
             errorMessage += `A network error occurred, possibly due to CORS. The 'listAll' operation requires the 'OPTIONS' method to be allowed in your Firebase Storage CORS configuration for the origin '${window.location.origin}'. Please verify your CORS settings include 'OPTIONS'.`;
         } else if (error.code === 'storage/object-not-found') {
            // This shouldn't happen with listAll on a folder, but good to handle.
             errorMessage += `The specified folder '${ARTICLES_FOLDER}' does not exist or you lack permissions.`;
         } else if (error.code === 'storage/unauthorized') {
             errorMessage += `Permission denied. Ensure your Storage security rules allow listing objects in the '${ARTICLES_FOLDER}' path, or that the user is authenticated if required.`;
         }
        else {
             errorMessage += `Unexpected error: ${error.message || 'Unknown listAll error'}`;
         }

        throw new Error(errorMessage);
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
