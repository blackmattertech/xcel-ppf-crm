import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xcel CRM",
  description: "Customer Relationship Management System",
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
