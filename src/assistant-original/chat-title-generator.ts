import type { ThreadMessage } from "@assistant-ui/core";

const GREETING = /^(ciao|salve|hey|hello|buongiorno|buonasera|buon giorno|buona sera)([!,.\s]|$)/i;
const MONEY = /\b(spendere|spendo|soldi|denaro|budget|risparmiare|risparmio|costi|costare|prezzo|prezzi|economi[ac])\b/i;
const PROJECT = /\b(progetto|costruendo|creando|sviluppando|lavorando|lavoro)\b/i;
const TRAVEL = /\b(viaggio|viaggiare|vacanza|milano|roma|parigi|canada|trasferit[oa])\b/i;

const firstUserText = (messages: readonly ThreadMessage[]): string => {
  const message = messages.find((item) => item.role === "user");
  const text = message?.content.find((part) => part.type === "text");
  return text?.type === "text" ? text.text.trim() : "";
};

const compactText = (text: string): string => {
  const sentence = text.split(/[.!?\n]/, 1)[0]?.trim() ?? text;
  return sentence.length > 48 ? `${sentence.slice(0, 45).trimEnd()}...` : sentence;
};

/**
 * Generates a stable, lightweight title for a thread. It runs once when the
 * thread-list runtime asks for a title and never calls an AI model.
 */
export const generateVinzChatTitle = (messages: readonly ThreadMessage[]): string => {
  const text = firstUserText(messages);
  if (!text) return "New Chat";
  if (GREETING.test(text) && text.split(/\s+/).length <= 8) return "Un saluto veloce";
  if (MONEY.test(text)) return "Panico Soldi";
  if (PROJECT.test(text)) return "Cose da costruire";
  if (TRAVEL.test(text)) return "Nuovi orizzonti";
  return compactText(text) || "New Chat";
};

export const vinzChatTitleGenerator = {
  generateTitle: async (messages: readonly ThreadMessage[]) => generateVinzChatTitle(messages),
};
