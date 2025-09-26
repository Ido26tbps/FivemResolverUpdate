// cfxJoinResolver.js
// Node 16+ recommended
// Usage: node cfxJoinResolver.js <cfx.re/join/abc123 OR abc123>

import fetch from "node-fetch";

const argv = process.argv.slice(2);
if (!argv[0]) {
  console.error("Usage: node cfxJoinResolver.js <cfx.re/join/ID or ID>");
  process.exit(1);
}

const input = argv[0].trim();

/**
 * Extract the join token/code from a variety of inputs:
 * - raw token: "abc123"
 * - full url: "https://cfx.re/join/abc123"
 * - join with trailing slash or query strings
 */
function extractToken(s) {
  // try basic regex for the token after join/
  const joinMatch = s.match(/cfx\.re\/join\/([A-Za-z0-9\-_.]+)/i);
  if (joinMatch) return joinMatch[1];

  // also accept servers.fivem.net/servers/detail/<token>
  const detailMatch = s.match(/servers\/detail\/([A-Za-z0-9\-_.]+)/i);
  if (detailMatch) return detailMatch[1];

  // if it looks like a plain token
  if (/^[A-Za-z0-9\-_.]+$/.test(s)) return s;

  throw new Error("Could not parse a cfx token from input: " + s);
}

/**
 * Query the FiveM servers frontend for a single server by token.
 * Public endpoint used by many community tools:
 *   https://servers-frontend.fivem.net/api/servers/single/<TOKEN>
 */
async function queryServersFrontend(token) {
  const url = `https://servers-frontend.fivem.net/api/servers/single/${token}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "node-cfx-resolver/1.0"
    },
    // the frontend expects GET
  });

  if (res.status === 404) {
    throw new Error("Server not found in FiveM front-end (404).");
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch server info: ${res.status} ${res.statusText}`);
  }

  const j = await res.json();
  return j;
}

/**
 * If we find endpoint(s) from the frontend (ip:port or ip),
 * try to fetch their /info.json to get more details.
 */
async function tryGetInfoFromEndpoint(endpoint) {
  // endpoint provided by API may already contain :port or be an IP
  // The server info endpoint is usually http(s)://<host>:<port>/info.json
  // Try http first on port if present, otherwise try as-is
  const url = endpoint.startsWith("http") ? `${endpoint.replace(/\/$/, "")}/info.json` : `http://${endpoint.replace(/\/$/, "")}/info.json`;
  try {
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // ignore network errors
    return null;
  }
}

(async () => {
  try {
    const token = extractToken(input);
    console.log("Token:", token);

    const data = await queryServersFrontend(token);
    // The structure can vary; common fields:
    // - Data.connectEndPoints (array of host:port strings)
    // - Data (object) may include info about server
    // We'll print the raw object and then try to extract connect endpoints
    console.log("Raw servers-frontend response:");
    console.log(JSON.stringify(data, null, 2));

    const endpoints = (data?.Data?.connectEndPoints) || (data?.Data?.ConnectEndPoints) || [];
    if (Array.isArray(endpoints) && endpoints.length) {
      console.log("\nResolved connect endpoints:");
      for (const ep of endpoints) {
        console.log(" -", ep);
      }

      // Optionally fetch /info.json from first endpoint for friendly info
      const first = endpoints[0];
      const info = await tryGetInfoFromEndpoint(first);
      if (info) {
        console.log("\nFetched /info.json from", first);
        console.log(`  hostname: ${info.hostname}`);
        console.log(`  players: ${info.clients}/${info.sv_maxclients}`);
        if (Array.isArray(info.resources)) {
          console.log(`  resources (${info.resources.length}): ${info.resources.slice(0,10).join(", ")}${info.resources.length>10 ? "..." : ""}`);
        }
      } else {
        console.log("\nCould not fetch /info.json from endpoint (blocked by CORS/firewall or not serving http).");
      }
    } else {
      console.log("\nNo connect endpoints present in response. Response may be a redirect or server is offline.");
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(2);
  }
})();
