import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "Ultrakool CRM",
  description: "Customer Relationship Management System",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: '/Ultrakool.png', type: 'image/png' }],
    apple: '/Ultrakool.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ultrakool CRM',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Register FCM service worker as early as possible so it receives push when app is background/killed (before next-pwa's SW) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof navigator!=='undefined'&&'serviceWorker'in navigator){navigator.serviceWorker.register('/api/push/sw',{scope:'/'}).catch(function(){});}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ultrakool CRM" />
        <link rel="icon" type="image/png" href="/Ultrakool.png" />
        <link rel="apple-touch-icon" href="/Ultrakool.png" />
        {/* Windows tile */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-TileImage" content="/Ultrakool.png" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </head>
      <body className="antialiased">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
