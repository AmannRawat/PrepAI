import dns from "node:dns";
import net from "node:net";

/**
 * Validates a single DNS server address (IPv4 or IPv6 with optional port).
 * Accepted formats:
 * - "8.8.8.8"
 * - "8.8.8.8:53"
 * - "2001:4860:4860::8888"
 * - "[2001:4860:4860::8888]:53"
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isValidDnsServerAddress(address) {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!trimmed) return false;

  // Check IPv4 with optional port (e.g., "8.8.8.8" or "8.8.8.8:53")
  const ipv4WithPortMatch = trimmed.match(
    /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$/
  );
  if (ipv4WithPortMatch) {
    const ip = ipv4WithPortMatch[1];
    const port = ipv4WithPortMatch[2];
    if (net.isIPv4(ip)) {
      if (port !== undefined) {
        const portNum = Number(port);
        return portNum >= 1 && portNum <= 65535;
      }
      return true;
    }
    return false;
  }

  // Check IPv6 bracketed with optional port (e.g. "[2001:4860:4860::8888]:53")
  const ipv6BracketMatch = trimmed.match(/^\[([a-fA-F0-9:]+)\](?::(\d+))?$/);
  if (ipv6BracketMatch) {
    const ip = ipv6BracketMatch[1];
    const port = ipv6BracketMatch[2];
    if (net.isIPv6(ip)) {
      if (port !== undefined) {
        const portNum = Number(port);
        return portNum >= 1 && portNum <= 65535;
      }
      return true;
    }
    return false;
  }

  // Check unbracketed raw IPv6
  if (net.isIPv6(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Parses and validates a list of DNS servers from a string or array.
 * @param {string|string[]} rawServers
 * @returns {{ valid: boolean, servers: string[], invalidEntries: string[] }}
 */
export function parseDnsServers(rawServers) {
  if (!rawServers) {
    return { valid: false, servers: [], invalidEntries: [] };
  }

  let candidates = [];
  if (Array.isArray(rawServers)) {
    candidates = rawServers;
  } else if (typeof rawServers === "string") {
    const trimmed = rawServers.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsedJson = JSON.parse(trimmed);
        if (Array.isArray(parsedJson)) {
          candidates = parsedJson;
        }
      } catch {
        candidates = trimmed.slice(1, -1).split(/[,;\s]+/);
      }
    } else {
      candidates = trimmed.split(/[,;\s]+/);
    }
  }

  const validServers = [];
  const invalidEntries = [];

  for (const item of candidates) {
    if (typeof item !== "string") continue;
    const clean = item.trim().replace(/^['"]|['"]$/g, "");
    if (!clean) continue;

    if (isValidDnsServerAddress(clean)) {
      validServers.push(clean);
    } else {
      invalidEntries.push(clean);
    }
  }

  return {
    valid: validServers.length > 0 && invalidEntries.length === 0,
    servers: validServers,
    invalidEntries,
  };
}

/**
 * Configures Node.js DNS servers if MONGODB_DNS_SERVERS is explicitly provided.
 * Leaves default DNS behavior untouched when the variable is absent or empty.
 * Never hardcodes third-party DNS servers in application code.
 *
 * @param {string|string[]} [customServers=process.env.MONGODB_DNS_SERVERS]
 * @returns {{ configured: boolean, servers: string[], error?: string }}
 */
export function configureMongoDns(
  customServers = process.env.MONGODB_DNS_SERVERS
) {
  if (!customServers || (typeof customServers === "string" && !customServers.trim())) {
    return {
      configured: false,
      servers: dns.getServers(),
    };
  }

  const { valid, servers, invalidEntries } = parseDnsServers(customServers);

  if (invalidEntries.length > 0) {
    const errorMsg = `Invalid DNS server address(es): ${invalidEntries.join(", ")}. Default DNS behavior unchanged.`;
    console.warn(`[DNS Warning] ${errorMsg}`);
    return {
      configured: false,
      servers: dns.getServers(),
      error: errorMsg,
    };
  }

  if (servers.length === 0) {
    return {
      configured: false,
      servers: dns.getServers(),
    };
  }

  try {
    dns.setServers(servers);
    console.log(
      `[DNS Diagnostic] Custom DNS resolver configured for MongoDB SRV lookups: [${servers.join(", ")}]`
    );
    return {
      configured: true,
      servers: dns.getServers(),
    };
  } catch (err) {
    console.warn(
      `[DNS Warning] Failed to set custom DNS servers [${servers.join(", ")}]: ${err.message}. Default DNS behavior unchanged.`
    );
    return {
      configured: false,
      servers: dns.getServers(),
      error: err.message,
    };
  }
}
