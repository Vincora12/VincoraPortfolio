"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef } from "react";

/* 🔷 «Le tabelle fanno scorrere in orizzontale tutta la chat.» Una `<table>`
   larga spinge il bubble del messaggio (e con lui la pagina) oltre lo
   schermo. Chiudendola in un contenitore con `overflow-x: auto` (vedi
   `.aui-md-table-scroll` in styles.css), a scorrere è solo la tabella. */
const TableScroll = (props: ComponentPropsWithoutRef<"table">) => (
  <div className="aui-md-table-scroll">
    <table {...props} />
  </div>
);

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
      components={{ table: TableScroll }}
    />
  );
}
