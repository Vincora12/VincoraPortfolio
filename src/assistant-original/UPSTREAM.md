# Official assistant-ui source

Pinned upstream commit: `030b49e72c5e966c224fc50ce1e05f61e2b387ef`

- ChatGPT surface: `apps/docs/components/pages/examples/chatgpt.tsx`
- Sidebar shell: `apps/docs/components/pages/examples/clone-thread-shell.tsx`
- Base UI components: `packages/ui/src/components/ui/base/`
- Model selector: `packages/ui/src/components/assistant-ui/model-selector.tsx`
- Sources: `packages/ui/src/components/assistant-ui/sources.tsx`
- License: MIT, preserved in `LICENSE`

Local changes are intentionally limited to import paths, the isolated mock
runtime, the model-selector overlay, and source rendering. The VINZ.MON app is
not imported by this checkpoint.
