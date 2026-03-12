import type { Metadata } from "next";
import { Montserrat, Roboto } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Pickup - Smart Locker System | 24/7 Package Pickup",
  description: "24/7 smart locker pickup system at UTech Campus, Jamaica. No waiting in lines. No missed deliveries. Your packages, ready when you are.",
  keywords: ["Pickup", "Smart Locker", "Package Pickup", "UTech Campus", "Jamaica", "876OnTheGo", "Dirty Hand Designs"],
  authors: [{ name: "Dirty Hand Designs + 876OnTheGo" }],
  icons: {
    icon: "/logo-icon.png",
  },
  openGraph: {
    title: "Pickup - Smart Locker System",
    description: "24/7 smart locker pickup at UTech Campus, Jamaica",
    url: "https://pickuplocker.vercel.app",
    siteName: "Pickup Jamaica",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pickup - Smart Locker System",
    description: "24/7 smart locker pickup at UTech Campus, Jamaica",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${roboto.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "'Roboto', sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
