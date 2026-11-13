import { checkAiHealth } from "../services/ai.service.js";

/**
 * PrepAI Health & Availability Controller
 * 
 * Provides lightweight, unauthenticated health status probes for:
 * 1. Main Express Node.js application server.
 * 2. Upstream Python FastAPI AI microservice.
 * 
 * Features:
 * - Low latency, non-blocking AI status probe (3000ms ceiling).
 * - Safe error boundaries (never throws 500 when upstream AI is sleeping).
 * - Zero sensitive data, secrets, or internal network topology exposed.
 * - Exempt from general rate limits to support cold-start polling.
 */

export async function getHealthStatus(req, res) {
  const requestedService = (req.query.service || "").toLowerCase();

  // Fast-path: Node-only availability check without awaiting upstream AI
  if (requestedService === "node") {
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        node: {
          status: "available",
          available: true,
        },
      },
    });
  }

  // Probe upstream AI service status with bounded timeout
  const aiHealth = await checkAiHealth(3000);

  // Fast-path: AI-only availability probe
  if (requestedService === "ai") {
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        ai: {
          status: aiHealth.status,
          available: aiHealth.available,
        },
      },
    });
  }

  // Combined status for both backends
  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      node: {
        status: "available",
        available: true,
      },
      ai: {
        status: aiHealth.status,
        available: aiHealth.available,
      },
    },
  });
}

export function getNodeHealth(req, res) {
  return res.status(200).json({
    status: "ok",
    service: "node",
    available: true,
    timestamp: new Date().toISOString(),
  });
}

export async function getAiHealth(req, res) {
  const aiHealth = await checkAiHealth(3000);
  return res.status(200).json({
    status: "ok",
    service: "ai",
    available: aiHealth.available,
    statusText: aiHealth.status,
    timestamp: new Date().toISOString(),
  });
}

