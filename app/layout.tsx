import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ResolveFlow AI — PayPal Dispute Intelligence',
  description: 'Case workspace and evidence intelligence for small merchants resolving PayPal disputes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-background text-foreground flex antialiased`}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <Topbar />
          <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
