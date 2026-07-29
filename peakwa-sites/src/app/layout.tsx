import type { Metadata } from 'next';
import { Inter, Nunito, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'optional',
  preload: true,
  adjustFontFallback: true,
});

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'optional',
  preload: false,
  adjustFontFallback: true,
});

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  display: 'optional',
  preload: false,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: 'Peakwa Sites',
  description: 'Business websites built automatically',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${nunito.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://images.pexels.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://images.pexels.com" />
      </head>
      <body className="min-h-full font-modern">{children}</body>
    </html>
  );
}
