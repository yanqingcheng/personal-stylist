import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal stylist · Colour study",
  description: "A personal colour consultation, taking shape.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
