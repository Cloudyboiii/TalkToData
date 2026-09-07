import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkToData — Ask Your Data in Plain English",
  description: "Upload a CSV, ask questions in plain English, get SQL queries and interactive charts instantly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
