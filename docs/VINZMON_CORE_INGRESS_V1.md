# VINZ.MON shared Core ingress

The existing /v1/models, /v1/responses and /v1/chat/completions functions remain
the only external ingress. Their shared openaiIngress owner uses existing auth,
cap, routing, provider and Usage boundaries. It now adds the same runtime-only
core-context projection used by web direct/tool chat.

The projection reads vinzmon-state/save for current Mon, Voice DNA/notes, mood
and awareness. Relevant personal memory comes only through core/memory's existing
backend selection; no direct Mem0/custom-store branching is added. A failed
canonical save read returns 503 externally; web can mark its local fallback.

Use base URL <production>/v1, model vinzmon-core and the existing VINZMON_TOKEN
in the client's secure configuration, never a URL. No new account/auth system.

Text conversation and client-owned function definitions/results are supported.
Tool IDs are preserved across assistant calls and outputs. The calling client,
not this ingress, executes its tools. VINZ.MON server mutation tools are not
silently advertised as Mac-local capabilities. Request history stays client-owned.
The existing successful-message capture boundary runs best-effort via waitUntil.

SSE is buffered framing after generation, not upstream token streaming. Stateful
Responses storage, full multimodal ingress and actual OpenClicky client execution
are not claimed. Unsupported paths must not be interpreted as successful actions.
There is no separate vinz-core function or second protocol router.

Validation: scripts/core-ingress-check.mjs and audit-unification-check.mjs use
real handlers with controlled I/O. Production and external-client tests remain
separate evidence.
