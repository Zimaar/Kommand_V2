import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Kommand — Your business, as a conversation",
  description: "Autonomous AI agent that runs your business through WhatsApp",
};

const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const inner = (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );

  if (!hasClerkKey) {
    return inner;
  }

  return <ClerkProvider>{inner}</ClerkProvider>;
}
