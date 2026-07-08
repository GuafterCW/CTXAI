# @ctxai/mcp

stdio MCP proxy for a self-hosted [CTXAI](https://github.com/) instance.
Use it with MCP clients that only speak stdio (e.g. Claude Desktop); Claude
Code can talk to CTXAI's HTTP endpoint directly instead.

## Usage

```bash
CTXAI_URL=http://localhost:3000 CTXAI_API_KEY=ctx_… npx @ctxai/mcp
```

Claude Desktop config:

```json
{
  "mcpServers": {
    "ctxai": {
      "command": "npx",
      "args": ["-y", "@ctxai/mcp"],
      "env": {
        "CTXAI_URL": "http://localhost:3000",
        "CTXAI_API_KEY": "ctx_…"
      }
    }
  }
}
```

Create the API key in your CTXAI instance under **Settings → API keys**.
