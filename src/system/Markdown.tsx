/* ============================================================================
   IL DISEGNATORE DI MARKDOWN (§21.2)

   🔒 Ogni pezzo di testo che arriva dal modello finisce dentro un NODO DI
   TESTO di React, mai dentro `dangerouslySetInnerHTML`. Non è una precauzione
   in più: è il motivo per cui le pagine si possono far scrivere a un modello
   senza pensarci ogni volta. React sfugge il testo per costruzione, quindi
   `<script>` scritto da qualcuno resta la parola `<script>` scritta a schermo.

   Le pagine usano i token di VINZ.MON — stessi caratteri, stessi bordi, stessa
   geometria rettangolare. Devono sembrare parte dell'app, non una pagina web
   incollata dentro.
   ========================================================================= */

import type { Block, Inline } from '../engine/markdown';
import { parseMarkdown } from '../engine/markdown';

function InlineRun({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'strong') return <strong key={i}>{p.text}</strong>;
        if (p.kind === 'em') return <em key={i}>{p.text}</em>;
        if (p.kind === 'code') return <code key={i} className="md__code">{p.text}</code>;
        if (p.kind === 'link') {
          /* `noreferrer` insieme a `noopener`: senza, la pagina che si apre
             sa da dove arrivi, e da dove arrivi qui è un'app personale. */
          return (
            <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="md__link">
              {p.text}
            </a>
          );
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading': {
      const content = <InlineRun parts={block.content} />;
      if (block.level === 1) return <h2 className="md__h1">{content}</h2>;
      if (block.level === 2) return <h3 className="md__h2">{content}</h3>;
      return <h4 className="md__h3">{content}</h4>;
    }

    case 'paragraph':
      return (
        <p className="md__p">
          <InlineRun parts={block.content} />
        </p>
      );

    case 'list':
      return block.ordered ? (
        <ol className="md__list md__list--num">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineRun parts={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="md__list">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineRun parts={item} />
            </li>
          ))}
        </ul>
      );

    case 'checklist':
      /* ⚠️ Le spunte si VEDONO ma non si toccano. Una casella cliccabile
         prometterebbe che lo stato si salva, e non si salva: il testo della
         pagina è di chi l'ha scritta. Una spunta finta che si scorda tutto al
         ricaricamento è peggio di una spunta disegnata. */
      return (
        <ul className="md__list md__list--check">
          {block.items.map((item, i) => (
            <li key={i} className={item.done ? 'md__done' : ''}>
              <span aria-hidden="true" className="md__box">
                {item.done ? '×' : ''}
              </span>
              <span className="md__boxlabel">
                <InlineRun parts={item.content} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'quote':
      return (
        <blockquote className="md__quote">
          <InlineRun parts={block.content} />
        </blockquote>
      );

    case 'table':
      return (
        <div className="md__tablewrap">
          <table className="md__table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i}>
                    <InlineRun parts={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <InlineRun parts={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'code':
      return <pre className="md__pre">{block.text}</pre>;

    case 'rule':
      return <hr className="md__rule" />;
  }
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);

  if (blocks.length === 0) return <p className="md__p t-small">Questa pagina è vuota.</p>;

  return (
    <div className="md">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}
