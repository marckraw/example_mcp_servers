# Streamable HTTP MCP Weather Server

A Model Context Protocol (MCP) server that provides weather information via the Streamable HTTP transport.

## Features

- **Streamable HTTP Transport**: Implements the MCP Streamable HTTP specification
- **Server-Sent Events (SSE)**: Supports streaming responses
- **Bearer Token Authentication**: Secure access with token-based auth
- **Stateless Mode**: Simple session-free operation
- **Three Tools**:
  - `get_alerts`: Get weather alerts for a US state
  - `get_forecast`: Get weather forecast for a location (latitude/longitude)
  - `check_website`: Check if a website is up or down

## Installation

```bash
npm install
```

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### With Custom Bearer Token

```bash
BEARER_TOKEN="your-custom-token" npm run dev
```

The server will start on `http://localhost:5555/mcp`

**Default Bearer Token**: `my-secret-token-12345`

## Testing

**Note**: All requests require a Bearer token in the Authorization header.

### Initialize Connection

```bash
curl -X POST http://localhost:5555/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer my-secret-token-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

### Get Weather Alerts

```bash
curl -X POST http://localhost:5555/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer my-secret-token-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_alerts",
      "arguments": {
        "state": "CA"
      }
    }
  }'
```

### Get Weather Forecast

```bash
curl -X POST http://localhost:5555/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer my-secret-token-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_forecast",
      "arguments": {
        "latitude": 37.7749,
        "longitude": -122.4194
      }
    }
  }'
```

### Check Website Status

```bash
curl -X POST http://localhost:5555/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer my-secret-token-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "check_website",
      "arguments": {
        "url": "https://google.com"
      }
    }
  }'
```

## Architecture

- **Transport**: StreamableHTTPServerTransport from @modelcontextprotocol/sdk
- **Server**: Express.js
- **Port**: 5555
- **Endpoint**: `/mcp` (supports both GET and POST)
- **Authentication**: Bearer token (configurable via environment variable)
- **Session Management**: Disabled (stateless mode)

## Protocol Details

The server implements the MCP Streamable HTTP transport specification:

- POST requests send JSON-RPC messages and receive SSE streams or JSON responses
- GET requests open SSE streams for server-initiated messages
- Responses are sent as Server-Sent Events with proper formatting
- All communication follows the JSON-RPC 2.0 specification

## Data Source

Weather data is provided by the National Weather Service (NWS) API. Only US locations are supported.
