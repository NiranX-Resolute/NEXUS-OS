/**
 * Nexus Orchestrator Client Service
 * Connects Desktop UI and Control Palette to the standalone Nexus Core Orchestrator Daemon (Port 8090)
 */

const DEFAULT_ORCHESTRATOR_URL = 'http://localhost:8090';

export interface OrchestratorHealth {
  online: boolean;
  service?: string;
  version?: string;
  uptime?: number;
  toolsCount?: number;
  sessionId?: string;
  error?: string;
}

export interface OrchestratorToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OrchestratorStepRecord {
  stepIndex: number;
  thought?: string;
  action: 'tool_call' | 'finish' | 'error';
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  selfCorrection?: string;
  timestamp: number;
}

export interface OrchestratorTaskResult {
  success: boolean;
  finalAnswer?: string;
  steps: OrchestratorStepRecord[];
  state: {
    status: string;
    stepCount: number;
    maxSteps: number;
    scratchpad: string[];
  };
  error?: string;
}

/**
 * Check if the Nexus Core Orchestrator daemon is running
 */
export async function checkOrchestratorHealth(
  baseUrl = DEFAULT_ORCHESTRATOR_URL
): Promise<OrchestratorHealth> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return {
        online: true,
        service: data.service,
        version: data.version,
        uptime: data.uptime,
        toolsCount: data.toolsCount,
        sessionId: data.sessionId,
      };
    }
    return { online: false, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { online: false, error: err?.message || 'Orchestrator daemon unreachable' };
  }
}

/**
 * Retrieve all registered tool definitions from the Orchestrator
 */
export async function listOrchestratorTools(
  baseUrl = DEFAULT_ORCHESTRATOR_URL
): Promise<OrchestratorToolDefinition[]> {
  try {
    const res = await fetch(`${baseUrl}/tools`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tools || [];
  } catch {
    return [];
  }
}

/**
 * Dispatch an autonomous multi-step ReAct task to the Orchestrator
 */
export async function runAutonomousTask(
  task: string,
  options: { maxSteps?: number; baseUrl?: string } = {}
): Promise<OrchestratorTaskResult> {
  const baseUrl = options.baseUrl || DEFAULT_ORCHESTRATOR_URL;

  const res = await fetch(`${baseUrl}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task,
      maxSteps: options.maxSteps,
    }),
  });

  const data = await res.json();
  return data as OrchestratorTaskResult;
}

/**
 * Directly invoke a single registered tool on the host OS
 */
export async function dispatchTool(
  toolName: string,
  args: Record<string, any> = {},
  baseUrl = DEFAULT_ORCHESTRATOR_URL
): Promise<{ success: boolean; output?: string; error?: string; data?: any }> {
  const res = await fetch(`${baseUrl}/api/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: toolName,
      args,
    }),
  });

  return (await res.json()) as {
    success: boolean;
    output?: string;
    error?: string;
    data?: any;
  };
}

/**
 * Request rollback of the last file operation or a specific transaction ID
 */
export async function rollbackTransaction(
  transactionId?: string,
  baseUrl = DEFAULT_ORCHESTRATOR_URL
): Promise<{ success: boolean; output?: string; error?: string }> {
  const res = await fetch(`${baseUrl}/api/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });

  return (await res.json()) as { success: boolean; output?: string; error?: string };
}
