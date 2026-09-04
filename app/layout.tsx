import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Buddy Keynote — STH',
  description: 'Créez et présentez vos keynotes avec Buddy, directement dans le navigateur.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
