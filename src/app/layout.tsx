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

// Removed the GeistSans function call as it was causing errors previously.
// The font variable is applied directly via className.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Content Security Policy to Allow CDN Scripts and Local Scripts (adjust as needed) */}
        {/* Added 'self' for local scripts like talkinghead.mjs */}
         <meta
           httpEquiv="Content-Security-Policy"
           content="script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' http://api.ispeech.org https://firebasestorage.googleapis.com;"
        />
        {/* Add Import Map for Three.js (CDN) and TalkingHead (Local) */}
        <Script
          id="import-map"
          strategy="beforeInteractive" // Load before other client-side scripts
          type="importmap"
          // Use dangerouslySetInnerHTML for the import map JSON
          dangerouslySetInnerHTML={{
            __html: `
            {
                "imports": {
                  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
                  "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
                  "talkinghead": "/talkinghead/talkinghead.mjs"
                 }
            }
            `,
          }}
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        // Apply the font variable directly using GeistSans.variable
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
