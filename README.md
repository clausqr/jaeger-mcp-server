# Jaeger MCP Server

![Build Status](https://github.com/serkan-ozal/jaeger-mcp-server/actions/workflows/build.yml/badge.svg)
![NPM Version](https://badge.fury.io/js/jaeger-mcp-server.svg)
![License](https://img.shields.io/badge/license-MIT-blue)

**Jaeger MCP Server** is a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that connects **AI assistants and LLMs** to [Jaeger](https://www.jaegertracing.io/) for distributed tracing and observability. Query traces, list services, and search spans from Cursor, Claude Desktop, VS Code, or any MCP client—using the Jaeger HTTP or gRPC API and **OpenTelemetry-compatible** formats.

**Use it to:** list Jaeger services and operations, find traces by service/time/attributes, and fetch full trace spans by ID—all from your AI chat or editor.

**AI/LLM-friendly:** Tools return **structured JSON** (OpenTelemetry resource spans) so models can reason over trace data, suggest fixes, or correlate with code. No screen-scraping—your AI gets first-class trace access for debugging, latency analysis, and observability workflows.

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Example prompts (AI / LLM)](#example-prompts-ai--llm)
- [Configuration](#configuration)
- [Development](#development)
- [Components (tools)](#components)
- [Roadmap](#roadmap)
- [Issues and Feedback](#issues-and-feedback)
- [Contribution](#contribution)

## Prerequisites
- Node.js 18+


## Quick Start

Install and run the server via the `jaeger-mcp-server` npm package. It uses STDIO transport and works with any MCP client: **VS Code**, **Claude Desktop**, **Cursor**, Windsurf, or GitHub Copilot.

### VS Code

```json
{
  "servers": {
    "jaeger-mcp-server": {
      "command": "npx",
      "args": ["-y", "jaeger-mcp-server"],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

### Claude Desktop
```json
{
  "mcpServers": {
    "jaeger-mcp-server": {
      "command": "npx",
      "args": ["-y", "jaeger-mcp-server"],
      "env": {
        "JAEGER_URL": "<YOUR_JAEGER_HTTP_OR_GRPC_API_URL>"
      }
    }
  }
}
```

### Cursor (local to project)
Use `.cursor/mcp.json` in the repo; it runs the local build and reads `JAEGER_URL` from `.env` or the config.

### Cursor (other projects or global)
To use from **any other project**, add the server to **global** MCP config so it’s available everywhere:

1. Open or create `~/.cursor/mcp.json`.
2. Add a `jaeger` entry under `mcpServers` (merge with existing servers if needed):

```json
{
  "mcpServers": {
    "jaeger": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "jaeger-mcp-server"],
      "env": {
        "JAEGER_URL": "http://localhost:16686"
      }
    }
  }
}
```

Set `JAEGER_URL` to your Jaeger API URL (HTTP or gRPC). Reload MCP in Cursor (Settings → Features → MCP, or Command Palette → MCP) and the Jaeger tools will show in chat.

Alternatively, in **another project** only, create that project’s `.cursor/mcp.json` with the same `jaeger` block above.

### Example prompts (AI / LLM)

Once the server is connected, you can ask your AI assistant in natural language; it will call the Jaeger MCP tools and interpret the results. Examples:

- *“What services are in Jaeger?”* → uses `get-services`
- *“List operations for the `api-gateway` service.”* → uses `get-operations`
- *“Find traces for `order-service` in the last hour.”* → uses `find-traces` with a narrow time window
- *“Show me the full trace for ID `014c2d3d2f2bc95b145834e7c6063744`.”* → uses `get-trace`
- *“Which traces for `payment-service` took longer than 500ms?”* → uses `find-traces` with `durationMin`

The model receives JSON (spans, attributes, durations) and can summarize, spot bottlenecks, or suggest where to look in your code.

## Configuration

### Environment Variables

For local development, copy `.env.example` to `.env` and set at least `JAEGER_URL` (see [Development](#development)).

- `JAEGER_URL`: HTTP API (`HTTP JSON` (`/api/v3/*`)) or the gRPC API (`gRPC/Protobuf` (`jaeger.api_v3.QueryService`)) URL of the Jaeger instance to access.
- `JAEGER_PORT`: HTTP or gRPC API port of the Jaeger instance to access. The default value is `16685` for the gRPC API and `16686` for the HTTP API.
- `JAEGER_AUTHORIZATION_HEADER`: `Authorization` HTTP header to be added into the requests for querying traces over Jaeger API (for ex. `Basic <Basic Auth Header>`)
- `JAEGER_PROTOCOL`: API protocol of the Jaeger instance to access. Valid values are `GRPC` and `HTTP`. The default value is `GRPC`.
- `JAEGER_REQUEST_TIMEOUT_MS`: Request timeout in milliseconds for API calls (e.g. `find-traces`). Prevents indefinite stalls when the backend is slow or the query range is large. Default `60000`. Override with a smaller value (e.g. `30000`) or larger if needed.

**Non-standard port (e.g. in Cursor MCP config):** Prefer putting the port in `JAEGER_URL` (e.g. `http://localhost:16764`). Alternatively set `JAEGER_URL` to the host and `JAEGER_PORT` to the port number.

### Debug output

To see server logs (e.g. why find-traces hangs or times out):

1. **In Cursor:** Open **Output** (View → Output or `Ctrl+Shift+U` / `Cmd+Shift+U`), then in the dropdown choose **MCP** or the channel for your Jaeger server. You’ll see stdout/stderr from the MCP process.
2. **Enable logging:** Set `JAEGER_DEBUG=1` in the MCP server env (e.g. in `.cursor/mcp.json` under `env` or in `.env`). Then restart MCP (reload Cursor’s MCP). You’ll get `[JAEGER-MCP-SERVER]` lines and, for find-traces, “find-traces start” / “find-traces end” or “find-traces error”.
3. **Run from terminal (no MCP):** Use the scripts so logs go to your terminal:
   - `npm run build && JAEGER_DEBUG=1 JAEGER_URL=... node dist/index.js` (then trigger the tool from Cursor), or
   - `npm run find-traces` to run a simple find-traces call and see timing/errors in the terminal.

### Simpler find-traces (avoid hanging)

Large time ranges (e.g. 2+ days) and high `searchDepth` can make the backend slow or hit timeouts. Prefer:

- **Narrow time window:** e.g. last 1 hour: `startTimeMin` / `startTimeMax` as RFC 3339 (e.g. `2026-02-14T12:00:00Z` and `2026-02-14T13:00:00Z`).
- **Lower searchDepth:** e.g. `10` instead of `100`.

Example (1-hour window, depth 10):

```json
{
  "serviceName": "webui-dashboard",
  "startTimeMin": "2026-02-14T12:00:00Z",
  "startTimeMax": "2026-02-14T13:00:00Z",
  "searchDepth": 10
}
```

Or run from the repo: `npm run build && JAEGER_URL=... npm run find-traces -- webui-dashboard` (uses last 1 hour and searchDepth 10; output and timing go to stderr).

### Verifying connectivity (get-trace script)

After building, you can verify that the server can reach Jaeger and fetch a trace by ID:

```bash
npm run build
JAEGER_URL=http://localhost:16686 npm run get-trace -- 014c2d3d2f2bc95b145834e7c6063744
```

Or with a `.env` that sets `JAEGER_URL`:

```bash
npm run build && node scripts/get-trace.js 014c2d3d2f2bc95b145834e7c6063744
```

The script uses the same client as the MCP server. Optional env: `JAEGER_PROTOCOL` (e.g. `HTTP` if your URL is the Jaeger UI/HTTP API), `JAEGER_PORT`, `JAEGER_AUTHORIZATION_HEADER`.

## Development

Contributors can build, lint, test, and run the server locally as follows.

1. **Install:** `npm install`
2. **Build:** `npm run build` (generates protos and compiles TypeScript to `dist/`)
3. **Lint:** `npm run lint` (Prettier check + ESLint). Fix formatting with `npm run lint:format`.
4. **Test:** `npm run test` (Vitest)
5. **Run locally:**
   - Copy `.env.example` to `.env`, set `JAEGER_URL` (and optionally `JAEGER_PROTOCOL`, `JAEGER_REQUEST_TIMEOUT_MS`, `JAEGER_DEBUG`).
   - **MCP Inspector:** `npm run inspector` — opens the MCP inspector so you can call tools against your local build (uses `dist/index.js` and env from the shell).
   - **Scripts:** e.g. `npm run find-traces -- <serviceName>` or `npm run get-trace -- <traceId>` (see [Simpler find-traces](#simpler-find-traces-avoid-hanging) and [Verifying connectivity](#verifying-connectivity-get-trace-script)).

CI runs on pull requests (lint, test, build). Before pushing, run `npm run lint` and `npm run test`.

## Components

### MCP tools

The server exposes four tools for Jaeger/OpenTelemetry trace data. Each returns deterministic JSON so AI agents and LLMs can reliably parse and reason over trace results.

- **`get-operations`**: Gets the operations as JSON array of object with `name` and `spanKind` properties.
  Supports the following input parameters:
    - `service`:
        - `Mandatory`: `true`
        - `Type`: `string`
        - `Description`: Filters operations by service name
    - `spanKind`:
        - `Mandatory`: `false`
        - `Type`: `string`
        - `Description`: Filters operations by OpenTelemetry span kind (`server`, `client`, `producer`, `consumer`, `internal`)
- **`get-services`**: Gets the service names as JSON array of string.
  No input parameter supported.
- **`get-trace`**: Gets the spans by the given trace by ID as JSON array of object in the OpenTelemetry resource spans format.
    - `traceId`:
        - `Mandatory`: `true`
        - `Type`: `string`
        - `Description`: Filters spans by OpenTelemetry compatible trace id in 32-character hexadecimal string format
    - `startTime`:
        - `Mandatory`: `false`
        - `Type`: `string`
        - `Description`: The start time to filter spans in the RFC 3339, section 5.6 format, (e.g., `2017-07-21T17:32:28Z`)
    - `endTime`:
        - `Mandatory`: `false`
        - `Type`: `string`
        - `Description`: The end time to filter spans in the RFC 3339, section 5.6 format, (e.g., `2017-07-21T17:32:28Z`)
- **`find-traces`**: Searches the spans as JSON array of object in the OpenTelemetry resource spans format.
    - `serviceName`:
        - `Mandatory`: `true`
        - `Type`: `string`
        - `Description`: Filters spans generated by a specific service.
    - `operationName`:
        - `Mandatory`: `false`
        - `Type`: `string`
        - `Description`: Filters spans by a specific operation / span name.
    - `attributes`:
        - `Mandatory`: `false`
        - `Type`: `map<string, string | number | boolean>`
        - `Description`: Filters spans by span attributes. Attributes can be passed in key/value format in JSON where 
                         keys can be string and values can be string, number (integer or double) or boolean.
                         For example

            ```json
            {
                "stringAttribute": "str",
                "integerAttribute": 123,
                "doubleAttribute": 123.456,
                "booleanAttribute": true,
            }
            ```
                         When using HTTP (`JAEGER_PROTOCOL=HTTP`), the client sends attributes as the
                         `query.attributes` query parameter (URL-encoded JSON map), matching the Jaeger API v3 format.
   - `startTimeMin`:
       - `Mandatory`: `true`
       - `Type`: `string`
       - `Description`: Start of the time interval (inclusive) in the RFC 3339, section 5.6 format, (e.g., `2017-07-21T17:32:28Z`) for the query. 
                        Only traces with spans that started on or after this time will be returned.
   - `startTimeMax`:
       - `Mandatory`: `true`
       - `Type`: `string`
       - `Description`: End of the time interval (exclusive) in the RFC 3339, section 5.6 format, (e.g., `2017-07-21T17:32:28Z`) for the query. 
                        Only traces with spans that started before this time will be returned.
   - `durationMin`:
       - `Mandatory`: `false`
       - `Type`: `string`
       - `Description`: Minimum duration of a span in **milliseconds** in the trace.
                        Only traces with spans that lasted at least this long will be returned.
   - `durationMax`:
       - `Mandatory`: `false`
       - `Type`: `string`
       - `Description`: Maximum duration of a span in **milliseconds** in the trace.
                        Only traces with spans that lasted at most this long will be returned.
   - `searchDepth`:
       - `Mandatory`: `false`
       - `Type`: `number`
       - `Description`: Defines the maximum search depth.
                        Depending on the backend storage implementation, this may behave like an SQL `LIMIT` clause.
                        However, some implementations might not support precise limits
                        and a larger value generally results in more traces being returned.

### Resources

N/A


## Roadmap

- **Done:** `find-traces` now works correctly over gRPC (server-stream, configurable timeout, URL handling). See [Debug output](#debug-output), [Simpler find-traces](#simpler-find-traces-avoid-hanging), and the `npm run find-traces` / `npm run get-trace` scripts.
- Support `HTTP Stream` transport protocol (`SSE` transport protocol is deprecated in favor of it) to be able to use the MCP server from remote.
- Support more tools which are not directly available over Jaeger API (orchestrating and pipelining multiple API endpoints).
- **Optional (backlog):** Lightweight “find trace IDs only” search, or a helper that finds traces then fetches N by ID, for workflows that don’t need full span payloads every time.


## Issues and Feedback

[![Issues](https://img.shields.io/github/issues/serkan-ozal/jaeger-mcp-server.svg)](https://github.com/serkan-ozal/jaeger-mcp-server/issues?q=is%3Aopen+is%3Aissue)
[![Closed issues](https://img.shields.io/github/issues-closed/serkan-ozal/jaeger-mcp-server.svg)](https://github.com/serkan-ozal/jaeger-mcp-server/issues?q=is%3Aissue+is%3Aclosed)

Please use [GitHub Issues](https://github.com/serkan-ozal/jaeger-mcp-server/issues) for any bug report, feature request and support.


## Contribution

[![Pull requests](https://img.shields.io/github/issues-pr/serkan-ozal/jaeger-mcp-server.svg)](https://github.com/serkan-ozal/jaeger-mcp-server/pulls?q=is%3Aopen+is%3Apr)
[![Closed pull requests](https://img.shields.io/github/issues-pr-closed/serkan-ozal/jaeger-mcp-server.svg)](https://github.com/serkan-ozal/jaeger-mcp-server/pulls?q=is%3Apr+is%3Aclosed)
[![Contributors](https://img.shields.io/github/contributors/serkan-ozal/jaeger-mcp-server.svg)]()

If you would like to contribute, please
- Fork the repository on GitHub and clone your fork.
- Create a branch for your changes and make your changes on it.
- Send a pull request with a clear description of your contribution.

See [Development](#development) for how to build, lint, test, and run locally. **CI** runs on pull requests targeting `master` or `develop` (lint, test, build). Before pushing, run `npm run lint` and `npm run test`.

> Tip:
> Please check the existing pull requests for similar contributions and
> consider submit an issue to discuss the proposed feature before writing code.

## License

Licensed under [MIT](LICENSE).
