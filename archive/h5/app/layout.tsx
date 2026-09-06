import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3001'),
  title: '岁月有声｜把想说的话，慢慢写成文章',
  description: '一款为长辈设计的温暖写作助手。',
  openGraph: {
    title: '岁月有声',
    description: '把想说的话，慢慢写成一篇文章',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '岁月有声',
    description: '把想说的话，慢慢写成一篇文章',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
