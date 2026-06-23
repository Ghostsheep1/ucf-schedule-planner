import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knight Planner",
  description: "A UCF schedule planner MVP with course search, filters, conflicts, and custom events."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
