import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
const jetBrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Buddy Keynote — STH',
  description:
    'Créez et présentez vos keynotes avec Buddy, directement dans le navigateur.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The CSP nonce is generated for each page request by proxy.ts.
  await connection();
  return (
    <html lang="fr" className={`${inter.variable} ${jetBrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
