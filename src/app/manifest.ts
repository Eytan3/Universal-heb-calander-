import type { MetadataRoute } from "next";

/** Lets the site be added to the iPhone / Android home screen and open like an app (no browser bars). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "עִתִּים · Ittim",
    short_name: "עִתִּים",
    description: "כל הלוחות ללא פשרות — Hebrew and Gregorian calendars as equals.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf8",
    theme_color: "#ff5a4e",
    dir: "rtl",
    lang: "he",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
