import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { ReactQueryProvider } from "./components/ReactQueryProvider";

export const metadata: Metadata = {
  title: "Interview.ai",
  description: "",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const body = (
    <html lang="en" className={`dark ${geist.variable}`}>
      <body>
        <ReactQueryProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className: "font-medium text-sm",
              duration: 4000,
              style: {
                background: "#1a1a1a",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "12px",
                border: "1px solid #2a2a2a",
              },
            }}
          />
        </ReactQueryProvider>
      </body>
    </html>
  );

  // Avoid crashing `next build` / prerender when Clerk env vars are absent.
  // Production still needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set on Vercel.
  if (!publishableKey) {
    return body;
  }

  return <ClerkProvider publishableKey={publishableKey}>{body}</ClerkProvider>;
}
