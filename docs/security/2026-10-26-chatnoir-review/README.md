# ChatNoir review of w2mcp, 26 October 2026

| | |
|---|---|
| Tool | [ChatNoir](https://github.com/fhajjej-ship-it/ChatNoir) v0.4.1, installed with `scripts/install.py --harness claude` |
| Host | Claude Code 2.1.283, model `claude-opus-5-5`, fresh headless session, read-only tools |
| Discovery | ChatNoir was loaded by name through the Skill tool, then `first-review.md`, `agent-security.md`, `review.md` and `evidence.md` |
| Focus | Agent permissions |
| Reviewed revision | `7672f5d` |
| Fix revision | `340f83a` |
| Session cost | 28 turns, about 3.5 minutes, USD 1.45 |

## Results

| ID | Finding | Status | Evidence |
|---|---|---|---|
| W2MCP-01 | API title becomes code in every generated server | fixed | `test-api-name-injection.mjs`: payload ran on server start before, not after |
| W2MCP-02 | Tool output can drive writes in `w2mcp ask` with no approval | fixed | `test-agent-tool-output.mjs`, scripted model: 1 injected write before, 0 after, read and answer preserved |
| W2MCP-03 | `w2mcp__create` silently replaced an existing server | fixed | static only |
| W2MCP-04 | Token exposure through attacker-chosen `base_url` | unresolved | needs a real deployment check |
| W2MCP-05 | Docs path shaped by injected page text | unresolved | needs a live model test |
| W2MCP-06, 07 | Path traversal, other code injection sites | dismissed | sanitizer and `JSON.stringify` at every other site |

The ChatNoir baseline scan returned 0 candidates here. Its agent rules are Python AST rules, so every finding came from the guided source review.

## Files

- `fresh-claude-code-session-prompt.txt` and `fresh-claude-code-session-output.md`: the exact request and the session's own summary
- `review.json`: ChatNoir report, passes `chatnoir.py validate`
- `review.md` and `review.pdf`: rendered with `chatnoir.py render` and `client-report`

Runtime evidence uses synthetic local inputs and a scripted model. It says nothing about how often real models follow injected text.
