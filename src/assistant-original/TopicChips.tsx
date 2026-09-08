/* ============================================================================
   I PULSANTINI SOPRA LA CHAT

   🔷 «Piccolissimo in alto sopra la chat, una serie di piccoli pulsanti con dei
   topic che posso cliccare quasi per dire continuiamo a parlare di questa cosa.»

   🔒 PICCOLI SUL SERIO. Sono un indice, non una navigazione: una riga sola che
   scorre di lato, testo minuscolo, nessuno sfondo pieno. Se diventassero
   protagonisti avremmo rimesso le schede delle conversazioni dalla porta di
   servizio — che è esattamente la cosa che abbiamo tolto.

   ⚠️ Toccarne uno NON cambia conversazione. Scrive nel composer e lascia il
   riassunto in contesto per quel turno: il filo resta uno, si riprende un
   discorso dentro di lui.
   ========================================================================= */

import { useAui } from '@assistant-ui/react';
import { useEffect, useState, type FC } from 'react';

import { TopicIcon } from '@/system/topicIcon';
import { listTopics, requestTopicContext, type ConversationTopic } from './conversation-topics';

export const TopicChips: FC = () => {
  const aui = useAui();
  const [topics, setTopics] = useState<ConversationTopic[]>([]);

  useEffect(() => {
    let live = true;
    const load = () => {
      void listTopics(10).then((rows) => {
        if (live) setTopics(rows);
      });
    };
    load();
    /* Un topic nasce quando un tratto si chiude, cioè raramente: bastano
       controlli radi, e nessuno mentre stai leggendo una risposta. */
    const timer = window.setInterval(load, 120_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!topics.length) return null;

  const resume = (topic: ConversationTopic) => {
    requestTopicContext(topic);
    aui.thread.composer().setText(`Riprendiamo il discorso su «${topic.title}».`);
  };

  return (
    <nav className="vinz-topic-chips" aria-label="Argomenti di cui abbiamo parlato">
      {topics.map((topic) => (
        <button key={topic.id} type="button" title={topic.summary} onClick={() => resume(topic)}>
          <TopicIcon text={`${topic.title} ${topic.summary}`} />
          <span>{topic.title}</span>
        </button>
      ))}
    </nav>
  );
};
