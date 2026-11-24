/**
 * Nexus OS v5.0 - Cloudflare Edge Mesh Worker
 * =============================================================================
 * Edge gateway routing between Web Dashboards, Mobile Agents, and Desktop Daemons.
 * Backed by Cloudflare D1 serverless SQLite and Cloudflare KV cache.
 *
 * Supported Endpoints:
 * - POST /api/heartbeat   : Device status registration & timestamp updates
 * - GET  /api/devices     : Real-time listing of active and standby devices
 * - POST /api/queue/push  : Dispatch tasks to target devices (DESKTOP, MOBILE, ALL)
 * - GET  /api/queue/poll  : Atomic task polling and lock acquisition for execution
 * - POST /api/queue/update: Complete, fail, or update execution results
 * =============================================================================
 */

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ENVIRONMENT?: string;
  DEFAULT_TARGET_DEVICE?: string;
}

interface HeartbeatPayload {
  device_id: string;
  device_type?: "DESKTOP" | "MOBILE" | "WEB";
  device_name?: string;
  status?: "ONLINE" | "BUSY" | "OFFLINE";
  battery_level?: number;
}

interface PushTaskPayload {
  id?: string;
  source_device?: string;
  target_device?: "DESKTOP" | "MOBILE" | "ALL";
  command_type: string;
  prompt_raw: string;
  action_plan?: any;
  media_blob?: string;
}

interface UpdateTaskPayload {
  id: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  result_output?: string;
  execution_log?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Nexus-Device-Id",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ success: false, error }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // 1. Health / Diagnostics
      if (url.pathname === "/" || url.pathname === "/health") {
        return jsonResponse({
          status: "online",
          service: "nexus-edge-mesh",
          version: "5.0.0",
          env: env.ENVIRONMENT || "production",
          timestamp: new Date().toISOString(),
        });
      }

      // 2. /api/heartbeat
      if (url.pathname === "/api/heartbeat" && request.method === "POST") {
        const body = (await request.json()) as HeartbeatPayload;
        if (!body.device_id) {
          return errorResponse("Missing required 'device_id'", 400);
        }

        const deviceType = body.device_type || "DESKTOP";
        const deviceName = body.device_name || `Nexus-${body.device_id}`;
        const deviceStatus = body.status || "ONLINE";
        const batteryLevel = typeof body.battery_level === "number" ? body.battery_level : 100;

        await env.DB.prepare(
          `INSERT INTO devices (device_id, device_type, device_name, status, battery_level, last_heartbeat)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(device_id) DO UPDATE SET
             device_type = excluded.device_type,
             device_name = excluded.device_name,
             status = excluded.status,
             battery_level = excluded.battery_level,
             last_heartbeat = CURRENT_TIMESTAMP;`
        )
          .bind(body.device_id, deviceType, deviceName, deviceStatus, batteryLevel)
          .run();

        // Update fast KV cache for sub-millisecond edge lookups
        if (env.KV) {
          await env.KV.put(
            `device:${body.device_id}`,
            JSON.stringify({
              device_id: body.device_id,
              status: deviceStatus,
              last_seen: Date.now(),
            }),
            { expirationTtl: 300 }
          );
        }

        return jsonResponse({
          success: true,
          device_id: body.device_id,
          status: deviceStatus,
          timestamp: new Date().toISOString(),
        });
      }

      // 3. /api/devices
      if (url.pathname === "/api/devices" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT device_id, device_type, device_name, status, battery_level, last_heartbeat
           FROM devices
           ORDER BY last_heartbeat DESC
           LIMIT 100;`
        ).all();

        return jsonResponse({
          success: true,
          devices: results || [],
          count: results?.length || 0,
        });
      }

      // 4. /api/queue/push
      if (url.pathname === "/api/queue/push" && request.method === "POST") {
        const body = (await request.json()) as PushTaskPayload;
        if (!body.prompt_raw || !body.command_type) {
          return errorResponse("Fields 'prompt_raw' and 'command_type' are required", 400);
        }

        const taskId = body.id || `task_${crypto.randomUUID()}`;
        const sourceDevice = body.source_device || "WEB";
        const targetDevice = body.target_device || env.DEFAULT_TARGET_DEVICE || "DESKTOP";
        const actionPlanStr = body.action_plan ? JSON.stringify(body.action_plan) : null;
        const mediaBlob = body.media_blob || null;

        await env.DB.prepare(
          `INSERT INTO tasks (
             id, source_device, target_device, command_type, prompt_raw,
             action_plan, media_blob, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', CURRENT_TIMESTAMP);`
        )
          .bind(
            taskId,
            sourceDevice,
            targetDevice,
            body.command_type,
            body.prompt_raw,
            actionPlanStr,
            mediaBlob
          )
          .run();

        return jsonResponse(
          {
            success: true,
            task_id: taskId,
            target_device: targetDevice,
            status: "QUEUED",
          },
          201
        );
      }

      // 5. /api/queue/poll
      if (url.pathname === "/api/queue/poll" && (request.method === "GET" || request.method === "POST")) {
        let targetDevice = url.searchParams.get("target_device");
        let deviceId = url.searchParams.get("device_id");

        if (request.method === "POST") {
          try {
            const body = (await request.json()) as any;
            if (body.target_device) targetDevice = body.target_device;
            if (body.device_id) deviceId = body.device_id;
          } catch {
            // Ignore JSON parse error on empty POST
          }
        }

        targetDevice = targetDevice || "DESKTOP";

        // Query oldest pending task matching target
        const pendingTask = await env.DB.prepare(
          `SELECT id, source_device, target_device, command_type, prompt_raw, action_plan, media_blob, status, created_at
           FROM tasks
           WHERE (target_device = ? OR target_device = 'ALL')
             AND status = 'QUEUED'
           ORDER BY created_at ASC
           LIMIT 1;`
        )
          .bind(targetDevice)
          .first<any>();

        if (!pendingTask) {
          return jsonResponse({
            success: true,
            task: null,
            message: "Queue empty",
          });
        }

        // Atomically transition status to PROCESSING
        await env.DB.prepare(
          `UPDATE tasks
           SET status = 'PROCESSING'
           WHERE id = ? AND status = 'QUEUED';`
        )
          .bind(pendingTask.id)
          .run();

        let parsedPlan = null;
        if (pendingTask.action_plan) {
          try {
            parsedPlan = JSON.parse(pendingTask.action_plan);
          } catch {
            parsedPlan = pendingTask.action_plan;
          }
        }

        return jsonResponse({
          success: true,
          task: {
            ...pendingTask,
            status: "PROCESSING",
            action_plan: parsedPlan,
          },
        });
      }

      // 6. /api/queue/update
      if (url.pathname === "/api/queue/update" && request.method === "POST") {
        const body = (await request.json()) as UpdateTaskPayload;
        if (!body.id || !body.status) {
          return errorResponse("Fields 'id' and 'status' are required", 400);
        }

        const completedAt = body.status === "COMPLETED" || body.status === "FAILED" ? new Date().toISOString() : null;

        await env.DB.prepare(
          `UPDATE tasks
           SET status = ?,
               result_output = COALESCE(?, result_output),
               execution_log = COALESCE(?, execution_log),
               completed_at = COALESCE(?, completed_at)
           WHERE id = ?;`
        )
          .bind(
            body.status,
            body.result_output || null,
            body.execution_log || null,
            completedAt,
            body.id
          )
          .run();

        return jsonResponse({
          success: true,
          task_id: body.id,
          status: body.status,
        });
      }

      return errorResponse(`Route not found: ${request.method} ${url.pathname}`, 404);
    } catch (err: any) {
      return jsonResponse(
        {
          success: false,
          error: err?.message || "Internal Edge Mesh Error",
          stack: err?.stack,
        },
        500
      );
    }
  },
};
