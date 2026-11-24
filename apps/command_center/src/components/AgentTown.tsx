import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAgentStore, agentStore, Agent } from '../store/agentStore';
import { Users, Play, Pause, Navigation, Plus, Award, CheckCircle2, AlertCircle } from 'lucide-react';

interface Desk {
  id: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ownerId?: string;
  type: 'terminal' | 'server_rack' | 'conference' | 'coffee';
}

const DESKS: Desk[] = [
  { id: 1, label: 'Workstation 01 (Arch)', x: 96, y: 128, w: 96, h: 64, type: 'terminal' },
  { id: 2, label: 'Workstation 02 (Scholar)', x: 288, y: 128, w: 96, h: 64, type: 'terminal' },
  { id: 3, label: 'Workstation 03 (NexKoder)', x: 480, y: 128, w: 96, h: 64, type: 'terminal' },
  { id: 4, label: 'Workstation 04 (Aegis)', x: 672, y: 128, w: 96, h: 64, type: 'terminal' },
  { id: 5, label: 'Workstation 05 (Vector)', x: 192, y: 320, w: 96, h: 64, type: 'terminal' },
  { id: 6, label: 'Central Matrix Hub', x: 384, y: 288, w: 160, h: 96, type: 'conference' },
  { id: 7, label: 'Sovereign Edge Cluster', x: 672, y: 320, w: 96, h: 96, type: 'server_rack' },
  { id: 8, label: 'Nexus Synth Lounge', x: 96, y: 448, w: 96, h: 64, type: 'coffee' },
];

export function AgentTown() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { agents } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agents[0]?.id || null);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [showDesks, setShowDesks] = useState<boolean>(true);
  const [clickDestination, setClickDestination] = useState<{ x: number; y: number } | null>(null);

  // Ref tracking agents for the rAF loop to avoid closure capture
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  // Selected agent object
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  // Dispatch agent to a specific desk
  const sendAgentToDesk = useCallback((agentId: string, deskId: number) => {
    const desk = DESKS.find((d) => d.id === deskId);
    if (!desk) return;
    const targetX = desk.x + desk.w / 2 - 12;
    const targetY = desk.y + desk.h + 8;
    agentStore.updateAgent(agentId, {
      targetX,
      targetY,
      deskId,
      status: 'executing',
    });
    agentStore.addLog({
      level: 'info',
      source: 'AgentTown',
      message: `Dispatched agent ${agentId} to ${desk.label}.`,
    });
  }, []);

  // Assemble agents around conference hub
  const gatherAtHub = useCallback(() => {
    const hub = DESKS.find((d) => d.id === 6);
    if (!hub) return;
    agentsRef.current.forEach((ag, idx) => {
      const offsetX = (idx % 3) * 48 - 48;
      const offsetY = Math.floor(idx / 3) * 56 + 110;
      agentStore.updateAgent(ag.id, {
        targetX: hub.x + hub.w / 2 + offsetX,
        targetY: hub.y + offsetY,
        status: 'thinking',
        currentTask: 'All-Hands Architecture Briefing: Nexus OS v5.0',
      });
    });
    agentStore.addLog({
      level: 'info',
      source: 'AgentTown',
      message: 'All sub-agents gathered at Central Matrix Hub.',
    });
  }, []);

  // Canvas click handler to move selected agent
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if clicked an agent directly
    for (const ag of agentsRef.current) {
      if (
        clickX >= ag.x - 10 &&
        clickX <= ag.x + 34 &&
        clickY >= ag.y - 10 &&
        clickY <= ag.y + 34
      ) {
        setSelectedAgentId(ag.id);
        return;
      }
    }

    // Otherwise move selected agent
    if (selectedAgentId) {
      setClickDestination({ x: clickX, y: clickY });
      agentStore.updateAgent(selectedAgentId, {
        targetX: clickX - 12,
        targetY: clickY - 12,
        status: 'executing',
      });
      agentStore.addLog({
        level: 'debug',
        source: selectedAgent?.name || 'Agent',
        message: `Navigating to sector (${Math.round(clickX)}, ${Math.round(clickY)})`,
      });
    }
  };

  // Main 2D Pixel-Art rendering loop with requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let tick = 0;

    const render = () => {
      tick++;

      // Resize canvas buffer if needed
      const width = canvas.width;
      const height = canvas.height;

      // Clear background
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw 32px Grid Lines (#1E293B)
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1;
      const gridSize = 32;

      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }

      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }

      // 2. Draw Office Furniture & Desks
      if (showDesks) {
        DESKS.forEach((desk) => {
          // Desk Drop Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(desk.x + 4, desk.y + 4, desk.w, desk.h);

          // Desk Surface
          ctx.fillStyle = desk.type === 'conference' ? '#1E293B' : desk.type === 'server_rack' ? '#0F172A' : '#1A2333';
          ctx.fillRect(desk.x, desk.y, desk.w, desk.h);

          // Desk Border / Accent
          ctx.strokeStyle = desk.type === 'server_rack' ? '#38BDF8' : '#334155';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(desk.x, desk.y, desk.w, desk.h);

          // Terminal Screens / Server Lights
          if (desk.type === 'terminal') {
            // Dual pixel monitors
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(desk.x + 12, desk.y + 10, 28, 18);
            ctx.fillRect(desk.x + 48, desk.y + 10, 28, 18);

            // Screen glow
            ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
            ctx.fillRect(desk.x + 10, desk.y + 8, 32, 22);
            ctx.fillRect(desk.x + 46, desk.y + 8, 32, 22);

            // Keyboard
            ctx.fillStyle = '#475569';
            ctx.fillRect(desk.x + 28, desk.y + 36, 40, 12);
          } else if (desk.type === 'server_rack') {
            // Blinking rack LED status
            const blink = Math.floor(tick / 15) % 2 === 0;
            ctx.fillStyle = blink ? '#10B981' : '#059669';
            ctx.fillRect(desk.x + 12, desk.y + 16, 8, 6);
            ctx.fillStyle = !blink ? '#38BDF8' : '#0284C7';
            ctx.fillRect(desk.x + 26, desk.y + 16, 8, 6);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(desk.x + 40, desk.y + 16, 8, 6);

            // Server slots
            for (let i = 0; i < 4; i++) {
              ctx.strokeStyle = '#1E293B';
              ctx.strokeRect(desk.x + 8, desk.y + 32 + i * 14, desk.w - 16, 10);
            }
          } else if (desk.type === 'conference') {
            // Holographic center emblem
            ctx.strokeStyle = '#38BDF8';
            ctx.beginPath();
            ctx.arc(desk.x + desk.w / 2, desk.y + desk.h / 2, 16, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
            ctx.fill();
          }

          // Desk Label
          ctx.fillStyle = '#64748B';
          ctx.font = '10px Inter, monospace';
          ctx.fillText(desk.label, desk.x + 4, desk.y - 6);
        });
      }

      // 3. Update & Draw Agent Sprites with Status Speech Bubbles
      const currentAgents = agentsRef.current;
      currentAgents.forEach((ag) => {
        // Interpolate position towards target if moving
        if (isRunningRef.current && ag.targetX !== undefined && ag.targetY !== undefined) {
          const dx = ag.targetX - ag.x;
          const dy = ag.targetY - ag.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 1.5) {
            const speed = 2.2;
            const newX = ag.x + (dx / dist) * speed;
            const newY = ag.y + (dy / dist) * speed;
            agentStore.updateAgentPosition(ag.id, newX, newY);
          }
        }

        // Bobbing walking animation
        const isMoving =
          ag.targetX !== undefined &&
          Math.hypot(ag.targetX - ag.x, (ag.targetY ?? ag.y) - ag.y) > 2;
        const bob = isMoving ? Math.sin(tick * 0.3) * 2 : 0;

        // Shadow underneath agent sprite
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(ag.x + 12, ag.y + 24, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Agent Sprite: 24x24 Rect (#38BDF8 base or custom color)
        const spriteColor = ag.avatarColor || '#38BDF8';
        ctx.fillStyle = spriteColor;
        ctx.fillRect(ag.x, ag.y + bob, 24, 24);

        // Pixel-art visor/eyes (cyber style)
        ctx.fillStyle = '#0B0F19';
        ctx.fillRect(ag.x + 4, ag.y + 6 + bob, 16, 5);

        // Glowing visor slit
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ag.x + 6, ag.y + 7 + bob, 6, 3);

        // Border highlight for selected agent
        if (ag.id === selectedAgentId) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.strokeRect(ag.x - 2, ag.y - 2 + bob, 28, 28);

          // Selection indicator arrow above
          ctx.fillStyle = '#38BDF8';
          ctx.beginPath();
          ctx.moveTo(ag.x + 12, ag.y - 8 + bob);
          ctx.lineTo(ag.x + 7, ag.y - 14 + bob);
          ctx.lineTo(ag.x + 17, ag.y - 14 + bob);
          ctx.fill();
        }

        // Status Speech Bubble: `${agent.name}: ${agent.status}`
        const speechText = `${ag.name}: ${ag.status}`;
        ctx.font = 'bold 11px Inter, sans-serif';
        const textWidth = ctx.measureText(speechText).width;
        const bubbleW = textWidth + 16;
        const bubbleH = 22;
        const bubbleX = ag.x + 12 - bubbleW / 2;
        const bubbleY = ag.y - 32 + bob;

        // Speech Bubble Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = ag.id === selectedAgentId ? '#38BDF8' : '#334155';
        ctx.lineWidth = 1;

        // Rounded rect for speech bubble
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6);
        ctx.fill();
        ctx.stroke();

        // Speech bubble pointer tail
        ctx.beginPath();
        ctx.moveTo(ag.x + 8, bubbleY + bubbleH);
        ctx.lineTo(ag.x + 12, bubbleY + bubbleH + 4);
        ctx.lineTo(ag.x + 16, bubbleY + bubbleH);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fill();

        // Text inside speech bubble
        ctx.fillStyle = ag.status === 'executing' ? '#38BDF8' : ag.status === 'thinking' ? '#10B981' : '#E2E8F0';
        ctx.fillText(speechText, bubbleX + 8, bubbleY + 15);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [selectedAgentId, showDesks]);

  return (
    <div className="flex flex-col h-full bg-[#070B14] rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl">
      {/* Header Controls */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#0B0F19] border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              Agent Town &bull; 2D Office Visualizer
            </h2>
            <p className="text-xs text-slate-400">
              Interactive 32px Grid Canvas &bull; {agents.length} Autonomous Workers Active
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              isRunning
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRunning ? 'Simulation: Active' : 'Simulation: Paused'}</span>
          </button>

          <button
            onClick={gatherAtHub}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700/80 transition-colors"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>All-Hands Sync</span>
          </button>

          <button
            onClick={() => setShowDesks(!showDesks)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800/70 text-slate-300 border border-slate-700 rounded-lg hover:text-slate-100"
          >
            {showDesks ? 'Hide Desks' : 'Show Desks'}
          </button>
        </div>
      </div>

      {/* Main Workspace Area (Canvas + Agent Inspector Sidebar) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 relative bg-[#090D16] flex items-center justify-center p-4">
          <canvas
            ref={canvasRef}
            width={860}
            height={560}
            onClick={handleCanvasClick}
            className="border border-slate-800 rounded-lg shadow-xl cursor-crosshair max-w-full h-auto"
          />

          <div className="absolute bottom-6 left-6 pointer-events-none bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded text-[11px] text-slate-400">
            Click grid cell to route selected agent &bull; Drag or click agent to inspect
          </div>
        </div>

        {/* Selected Agent Inspector Panel */}
        <div className="w-80 bg-[#0B0F19] border-l border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Agent Inspector
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                  selectedAgent.status === 'executing'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : selectedAgent.status === 'thinking'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {selectedAgent.status}
              </span>
            </div>

            {/* Agent Header Card */}
            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg mb-4">
              <div className="flex items-center space-x-3 mb-2">
                <div
                  className="w-7 h-7 rounded flex items-center justify-center text-slate-950 font-bold text-xs"
                  style={{ backgroundColor: selectedAgent.avatarColor || '#38BDF8' }}
                >
                  {selectedAgent.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{selectedAgent.name}</h3>
                  <p className="text-xs text-slate-400">{selectedAgent.role}</p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 text-xs">
                <p className="text-[11px] text-slate-400 mb-1">Current Active Task:</p>
                <p className="text-slate-200 font-medium leading-relaxed">{selectedAgent.currentTask}</p>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Task Execution</span>
                  <span className="font-mono text-sky-400">{selectedAgent.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 transition-all duration-300"
                    style={{ width: `${selectedAgent.progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Station Dispatch Buttons */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Dispatch To Workstation
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DESKS.slice(0, 4).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => sendAgentToDesk(selectedAgent.id, d.id)}
                    className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700/60 rounded text-left truncate transition-colors"
                  >
                    {d.label.split(' ')[0]} {d.label.split(' ')[1]}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent Telemetry Data */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Coordinates</span>
                <span className="font-mono text-slate-200">
                  X: {Math.round(selectedAgent.x)}, Y: {Math.round(selectedAgent.y)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Tokens Processed</span>
                <span className="font-mono text-slate-200">
                  {selectedAgent.tokensProcessed.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Heartbeat</span>
                <span className="text-emerald-400">{selectedAgent.lastActive}</span>
              </div>
            </div>
          </div>

          {/* Quick Roster Selector */}
          <div className="pt-4 border-t border-slate-800">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              All Roster Sub-Agents ({agents.length})
            </label>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {agents.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => setSelectedAgentId(ag.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                    ag.id === selectedAgentId
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span className="truncate">{ag.name}</span>
                  <span className="text-[10px] text-slate-500 capitalize">{ag.status}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default AgentTown;
