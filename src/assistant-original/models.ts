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
] as const satisfies readonly ModelOption[];

export const DEFAULT_MODEL_ID = MODELS[0].id;
