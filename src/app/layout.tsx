import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import Script from 'next/script'; // Import Script component
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
      {/* No explicit <head> tag needed in App Router RootLayout */}

      {/* Add Import Map for Three.js and TalkingHead CDN */}
      {/* IMPORTANT: This needs to be directly under <html> or in <head> if using Pages Router _document.js */}
      {/* Using dangerouslySetInnerHTML is correct for type="importmap" */}
      <Script
        id="import-map"
        strategy="beforeInteractive" // Ensures it loads before other scripts needing these modules
        type="importmap"
        dangerouslySetInnerHTML={{
          __html: `
            {
              "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
                "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
                "talkinghead": "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.4/modules/talkinghead.mjs"
              }
            }
          `,
        }}
      />
      {/* Favicon link */}
      <link rel="icon" href="/favicon.ico" sizes="any" />

      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          GeistSans.variable
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
