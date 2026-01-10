import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ViewportHandler } from "@/components/ViewportHandler";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Private AI Virtual Assistant",
  description: "Private AI Chat Assistant",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/personal-logo-dark.svg" media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/svg+xml" href="/personal-logo-light.svg" media="(prefers-color-scheme: light)" />
      </head>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="dark" storageKey="theme">
          <ViewportHandler />
          <SidebarProvider>
            <div className="flex h-screen bg-background w-full">
              <ChatSidebar />
              {children}
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
