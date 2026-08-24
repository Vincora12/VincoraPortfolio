# assistant-ui ChatGPT Clone — official-source checkpoint

This temporary checkpoint keeps the assistant-ui chat surface separate from the VINZ.MON backend.

## Run

From the repository root:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/assistant-example/` (or the port printed by Vite).

The UI is vendored from the official assistant-ui repository at the pinned
commit documented in `src/assistant-original/UPSTREAM.md`. The only additions
are the official Base UI model selector, official Sources renderer, and an
isolated local mock runtime. It requires no API key.

For an integration check against the existing protected VINZ.MON backend,
open the same URL with `?runtime=backend`. The default remains the safe local
mock until this checkpoint is approved.

Official source reference: <https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/components/pages/examples/chatgpt.tsx>

assistant-ui is distributed under the MIT License. This checkpoint stays
separate from the VINZ.MON application until visual approval.
