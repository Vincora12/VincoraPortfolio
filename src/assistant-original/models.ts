import type { ModelOption } from "./components/assistant-ui/model-selector";

export const MODELS = [
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description: "OpenAI · foto e ricerca web",
    efforts: true,
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    description: "OpenAI · foto e ricerca web",
    efforts: true,
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    description: "OpenAI · foto e ricerca web",
    efforts: true,
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Anthropic · ricerca web",
    efforts: true,
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    description: "Anthropic · ricerca web",
    efforts: true,
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    description: "Moonshot · disponibile",
    efforts: true,
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    description: "Moonshot · un gradino sotto K3, costa meno",
    efforts: true,
  },
  {
    id: "grok-4.6",
    name: "Grok 4.6",
    description: "xAI · richiede la chiave xAI",
    efforts: true,
  },
  {
    id: "gpt-oss:20b",
    name: "GPT-OSS 20B",
    description: "Locale · gratuito · consigliato per i compiti semplici",
  },
  {
    id: "qwen2.5:14b",
    name: "Qwen 2.5 14B",
    description: "Locale · gratuito",
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    description: "Locale · gratuito · solo richieste basilari",
  },
] as const satisfies readonly ModelOption[];

export const DEFAULT_MODEL_ID = MODELS[0].id;
