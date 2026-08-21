# assistant-ui ChatGPT Clone — local mock

This temporary checkpoint keeps the assistant-ui chat surface separate from the VINZ.MON backend.

## Run

From the repository root:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/assistant-example/` (or the port printed by Vite).

The mock runtime is isolated in `src/assistant-example/mockRuntime.ts`. It requires no API key and can later be replaced without changing the interface.

Official source reference: <https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/components/pages/examples/chatgpt.tsx>

assistant-ui is distributed under the MIT License.
