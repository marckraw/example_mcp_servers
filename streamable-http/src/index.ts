import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
const PORT = 5555;

// Bearer token for authentication
// In production, use environment variables and secure token management
const BEARER_TOKEN = process.env.BEARER_TOKEN || "my-secret-token-12345";

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

// Format alert data
function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

// Create server instance
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register weather tools
server.tool(
  "get_alerts",
  "Get weather alerts for a state",
  {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
  },
  async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
    const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

    if (!alertsData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve alerts data",
          },
        ],
      };
    }

    const features = alertsData.features || [];
    if (features.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No active alerts for ${stateCode}`,
          },
        ],
      };
    }

    const formattedAlerts = features.map(formatAlert);
    const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join(
      "\n"
    )}`;

    return {
      content: [
        {
          type: "text",
          text: alertsText,
        },
      ],
    };
  }
);

server.tool(
  "get_forecast",
  "Get weather forecast for a location",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of the location"),
  },
  async ({ latitude, longitude }) => {
    // Get grid point data
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(
      4
    )},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

    if (!pointsData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
          },
        ],
      };
    }

    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to get forecast URL from grid point data",
          },
        ],
      };
    }

    // Get forecast data
    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve forecast data",
          },
        ],
      };
    }

    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No forecast periods available",
          },
        ],
      };
    }

    // Format forecast periods
    const formattedForecast = periods.map((period: ForecastPeriod) =>
      [
        `${period.name || "Unknown"}:`,
        `Temperature: ${period.temperature || "Unknown"}°${
          period.temperatureUnit || "F"
        }`,
        `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
        `${period.shortForecast || "No forecast available"}`,
        "---",
      ].join("\n")
    );

    const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join(
      "\n"
    )}`;

    return {
      content: [
        {
          type: "text",
          text: forecastText,
        },
      ],
    };
  }
);

server.tool(
  "check_website",
  "Check if a website is up or down",
  {
    url: z
      .string()
      .url()
      .describe("The website URL to check (e.g., https://example.com)"),
  },
  async ({ url }) => {
    const startTime = Date.now();

    try {
      // Make a HEAD request for efficiency (doesn't download full content)
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const responseTime = Date.now() - startTime;
      const status = response.ok ? "✅ UP" : "⚠️ DEGRADED";

      return {
        content: [
          {
            type: "text",
            text: [
              `Website Status Check: ${url}`,
              `Status: ${status}`,
              `HTTP Code: ${response.status} ${response.statusText}`,
              `Response Time: ${responseTime}ms`,
              `Server: ${response.headers.get("server") || "Unknown"}`,
              `Content-Type: ${
                response.headers.get("content-type") || "Unknown"
              }`,
            ].join("\n"),
          },
        ],
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        content: [
          {
            type: "text",
            text: [
              `Website Status Check: ${url}`,
              `Status: ❌ DOWN`,
              `Error: ${errorMessage}`,
              `Response Time: ${responseTime}ms`,
            ].join("\n"),
          },
        ],
      };
    }
  }
);

// Bearer token authentication middleware
function requireBearerAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Missing Authorization header",
      },
      id: null,
    });
    return;
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer") {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid authentication scheme. Expected Bearer token.",
      },
      id: null,
    });
    return;
  }

  if (token !== BEARER_TOKEN) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid bearer token",
      },
      id: null,
    });
    return;
  }

  // Token is valid, proceed to the next middleware
  next();
}

// Create Express app
const app = express();
app.use(express.json());

// MCP endpoint supporting both GET and POST (with Bearer auth)
app.all("/mcp", requireBearerAuth, async (req: Request, res: Response) => {
  // Create a new transport instance for each request
  // Using stateless mode (no session management)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  // Connect the server to the transport
  await server.connect(transport);

  // Handle the HTTP request
  await transport.handleRequest(req, res, req.body);
});

async function main() {
  app.listen(PORT, () => {
    console.error(`Weather MCP Server running on http://localhost:${PORT}/mcp`);
    console.error(`Bearer token authentication enabled`);
    console.error(`Use Authorization header: Bearer ${BEARER_TOKEN}`);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
