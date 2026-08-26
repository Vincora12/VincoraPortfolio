"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      defer
      /* 🔷 «Le parole della chat devono entrare una alla volta.» Il testo
         arriva già intero per i modelli che non trasmettono a pezzi (solo
         Claude lo fa oggi, lato server) — `smooth` lo rivela comunque con un
         effetto macchina da scrivere, uguale per tutti i modelli. Si
         disattiva da solo con `prefers-reduced-motion`. */
      smooth
    />
  );
}
