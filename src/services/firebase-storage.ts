import { storage } from './firebase-config';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import type { NewsArticle } from './news-scraper';

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
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: StoredArticleData = await response.json();
        console.log(`Article ${articleId} retrieved successfully.`);
        return data;
    } catch (error: any) {
         if (error.code === 'storage/object-not-found') {
             console.warn(`Article ${articleId} not found in storage.`);
             throw new Error(`Article not found.`);
         }
        console.error(`Error retrieving article ${articleId}:`, error);
        throw new Error(`Failed to retrieve article data: ${error.message}`);
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
