import type { Metadata } from "next";
import { Inter, Petrona } from "next/font/google";
import { Navigation } from "@/components/navigation";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext", "vietnamese"],
  axes: ["opsz"],
});

const petrona = Petrona({
  variable: "--font-heading",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

export const metadata: Metadata = {
  title: "TeachMe - Learning Journey Platform",
  description:
    "Transform documents and internet knowledge into creative learning journeys and ace your interviews with AI-powered preparation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${petrona.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Navigation />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
