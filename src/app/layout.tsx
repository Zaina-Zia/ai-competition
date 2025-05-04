import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans'; // Use named import
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

// Remove the direct call to GeistSans, use the imported object directly
// const geistSans = GeistSans({
//   variable: '--font-geist-sans',
//   subsets: ['latin'],
// });


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
