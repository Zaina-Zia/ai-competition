import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Encodes a string into URL-safe Base64 format.
 * Replaces '+' with '-', '/' with '_', and removes trailing '='.
 * @param str The string to encode.
 * @returns The URL-safe Base64 encoded string.
 */
export function encodeBase64UrlSafe(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a URL-safe Base64 string back to its original format.
 * Adds back padding, replaces '-' with '+', and '_' with '/'.
 * @param str The URL-safe Base64 encoded string.
 * @returns The original decoded string.
 */
export function decodeBase64UrlSafe(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if necessary
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}
