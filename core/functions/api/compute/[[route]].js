/**
 * Cloudflare Pages Functions - Federated Compute Pool Edge Registry.
 *
 * Backed by Cloudflare KV (env.NEXUS_KV) and secured with NEXUS_TOKEN Bearer auth.
 * Provides live node registration, discovery, and deregistration for zero-card
 * GPU/CPU compute providers (Kaggle, Colab, Hugging Face, Tailscale).
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function checkAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  let token = "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get("token") || "";
  }

  if (!token) {
    return false;
  }

  const expectedToken = env.NEXUS_TOKEN;
  if (expectedToken && token !== expectedToken) {
    return false;
  }

  return true;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return onRequestOptions();
  }

  if (!env.NEXUS_KV) {
    return jsonResponse(
      {
        success: false,
        error: "NEXUS_KV binding is missing or not configured in environment.",
      },
      500
    );
  }

  // 1. Authentication Check
  if (!checkAuth(request, env)) {
    return jsonResponse(
      {
        success: false,
        error: "Unauthorized: Invalid or missing NEXUS_TOKEN Bearer header.",
      },
      401
    );
  }

  // 2. Route Dispatching
  // Matches:
  // POST /api/compute/register
  // GET  /api/compute/nodes
  // DELETE /api/compute/nodes/:node_id
  const routeSegments = Array.isArray(params?.route) ? params.route : [];
  const routePath = routeSegments.join("/");

  // Handle POST /api/compute/register
  if (method === "POST" && (routePath === "register" || path.endsWith("/compute/register"))) {
    try {
      const body = await request.json();
      const {
        node_id,
        url: nodeUrl,
        type = "gpu",
        model = "default",
        vram_gb = 0,
        ram_gb = 0,
        cpu_cores = 0,
        provider = "custom",
        idle_seconds = 0,
        expiration_ttl = 180,
      } = body;

      if (!node_id || typeof node_id !== "string") {
        return jsonResponse(
          { success: false, error: "Missing or invalid 'node_id' in registration payload." },
          400
        );
      }

      if (!nodeUrl || typeof nodeUrl !== "string") {
        return jsonResponse(
          { success: false, error: "Missing or invalid 'url' in registration payload." },
          400
        );
      }

      const nodeRecord = {
        node_id,
        url: nodeUrl,
        type,
        model,
        vram_gb: Number(vram_gb) || 0,
        ram_gb: Number(ram_gb) || 0,
        cpu_cores: Number(cpu_cores) || 0,
        provider,
        idle_seconds: Number(idle_seconds) || 0,
        status: "ACTIVE",
        registered_at: Date.now(),
        last_heartbeat: Date.now(),
      };

      // Store in NEXUS_KV with 180s (3 min) TTL for rapid auto-expiration of dead nodes
      const ttl = Math.max(60, Math.min(86400, Number(expiration_ttl) || 180));
      await env.NEXUS_KV.put(`node:${node_id}`, JSON.stringify(nodeRecord), {
        expirationTtl: ttl,
      });

      return jsonResponse(
        {
          success: true,
          message: "Node registered successfully.",
          node: nodeRecord,
        },
        200
      );
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          error: `Failed to register node: ${err.message}`,
        },
        400
      );
    }
  }

  // Handle GET /api/compute/nodes
  if (method === "GET" && (routePath === "nodes" || path.endsWith("/compute/nodes"))) {
    try {
      const listResult = await env.NEXUS_KV.list({ prefix: "node:" });
      const activeNodes = [];

      for (const key of listResult.keys) {
        const raw = await env.NEXUS_KV.get(key.name);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            activeNodes.push(parsed);
          } catch {
            // Skip unparseable entry
          }
        }
      }

      // Sort nodes: GPUs by VRAM descending, then RAM descending
      activeNodes.sort((a, b) => {
        if (a.type === "gpu" && b.type !== "gpu") return -1;
        if (a.type !== "gpu" && b.type === "gpu") return 1;
        return (b.vram_gb || 0) - (a.vram_gb || 0) || (b.ram_gb || 0) - (a.ram_gb || 0);
      });

      return jsonResponse(
        {
          success: true,
          active_nodes: activeNodes,
          count: activeNodes.length,
          timestamp: Date.now(),
        },
        200
      );
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          error: `Failed to list nodes: ${err.message}`,
        },
        500
      );
    }
  }

  // Handle DELETE /api/compute/nodes/:node_id
  if (method === "DELETE" && (routePath.startsWith("nodes/") || path.includes("/compute/nodes/"))) {
    let nodeId = "";
    if (routeSegments.length >= 2 && routeSegments[0] === "nodes") {
      nodeId = routeSegments.slice(1).join("/");
    } else {
      const parts = path.split("/compute/nodes/");
      if (parts.length > 1) {
        nodeId = parts[1].replace(/^\/+|\/+$/g, "");
      }
    }

    if (!nodeId) {
      return jsonResponse(
        { success: false, error: "Missing node_id in DELETE path." },
        400
      );
    }

    try {
      await env.NEXUS_KV.delete(`node:${nodeId}`);
      return jsonResponse(
        {
          success: true,
          message: "Node deregistered successfully.",
          node_id: nodeId,
        },
        200
      );
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          error: `Failed to deregister node: ${err.message}`,
        },
        500
      );
    }
  }

  return jsonResponse(
    {
      success: false,
      error: `Endpoint not found: ${method} ${path}`,
    },
    404
  );
}
