# pi-context

Context management extension for [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) — tool result formatting, distillation, context panel, and aging.

## What It Does

AI coding agents accumulate context quickly — tool outputs pile up, old messages become irrelevant, and the agent loses track of what matters. pi-context automatically manages your agent's context window:

- **Tool result processing** — Formats and truncates tool outputs (bash, web search, web reader, MCP errors) to keep context lean
- **Distillation** — Replaces verbose tool results with compact summaries, preserving key information
- **Context aging** — Marks older messages for compaction based on configurable rules
- **Context panel** — Displays a TUI sidebar showing context usage, distillation stats, and message metadata
- **Payload recording** — Records provider payloads for debugging token usage

## Installation

```bash
pi install git:github.com/catlain/pi-context
```

## Commands

| Command | Description |
|---------|-------------|
| `/context` | Toggle context panel visibility |
| `/record [on/off]` | Enable/disable provider payload recording |
| `/distill-config` | Configure distillation rules |
| `/aging-config` | Configure context aging rules |
| `/processor-config` | Configure tool result processor rules |

## How It Works

### Tool Result Processing Chain

When a tool returns a result, pi-context runs it through a chain of formatters:

1. **Web search** → Extract titles, URLs, summaries; strip boilerplate
2. **GitHub** → Compact issue/PR/commit data
3. **Web reader** → Truncate large pages, extract key content
4. **Bash** → Strip ANSI codes, truncate long output
5. **MCP errors** → Clean up verbose error traces

### Distillation

After processing, distillation replaces old tool results with compact summaries. Configure which tools to distill and retention rules via `/distill-config`.

### Context Aging

Messages older than a configurable threshold get marked for compaction, keeping the context window focused on recent, relevant information.

## Configuration

Settings are stored in `~/.pi/agent/settings.json` under the `context` section:

```json
{
  "context": {
    "distill": true,
    "aging": true,
    "record": false
  }
}
```

## Dependencies

- `@pi-atelier/shared-utils` (bundled) — settings management
- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)
- `@earendil-works/pi-tui` — context panel UI (peer)

## License

MIT
