import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '岁月有声 · 运营后台',
  description: '岁月有声小程序的内容运营工作台。',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
