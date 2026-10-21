import type { Metadata } from "next";
import { Russo_One, Chakra_Petch } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const russo = Russo_One({
  weight: "400",
  variable: "--font-russo",
  subsets: ["latin"],
});

const chakra = Chakra_Petch({
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "pokedash",
  description: "Pokémon TCG deals against Cardmarket market values",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions (e.g. Dark Reader) add attributes to <html> before React hydrates.
    <html
      lang="en"
      className={`${russo.variable} ${chakra.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
