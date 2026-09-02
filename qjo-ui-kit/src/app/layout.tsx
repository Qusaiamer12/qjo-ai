import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qjo AI Assistant Interface",
  description: "Interactive AI assistant interface built with shadcn/ui, Tailwind and React",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
