import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import Script from 'next/script'; // Correct import for Script
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'NewsCast Now',
  description: 'Your daily news, summarized and visualized.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
         {/* Add Import Map for Three.js and TalkingHead CDN */}
         {/* Ensure the talkinghead URL points to the correct .mjs file */}
         <Script
           id="import-map"
           strategy="beforeInteractive" // Load before other client-side scripts
           type="importmap"
           dangerouslySetInnerHTML={{
            __html: `
            {
                "imports": {
                  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
                  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
                  "talkinghead": "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.4/modules/talkinghead.mjs"
                 }
            }
            `,
           }}
        />
        {/* Content Security Policy - Adjusted to allow CDN and API calls */}
        {/* Note: Adjust 'connect-src' if your Firebase Storage URL or other APIs change */}
         <meta
           httpEquiv="Content-Security-Policy"
           content="script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' http://api.ispeech.org https://firebasestorage.googleapis.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' data:;"
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          GeistSans.variable // Use the variable provided by the import
        )}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
