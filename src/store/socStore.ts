// 客户端状态层 —— 在线走 /api/soc(Turso),异常自动降级 localStorage 镜像
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AlertFilters,
  Asset,
  ConnectionMode,
  DispositionRecord,
  LearningMemory,
  RawAlert,
  SocSnapshot,
} from "@/types";
import { applyFalsePositiveMemory, applyTruePositiveMemory } from "@/lib/engine";
import { SEED_ALERTS, SEED_ASSETS } from "@/lib/seed";

interface SocStore {
  assets: Asset[];
  alerts: RawAlert[];
  learningMemory: LearningMemory;
  dispositions: DispositionRecord[];
  connectionMode: ConnectionMode;
  status: "idle" | "loading" | "ready";
  filters: AlertFilters;
  viewMode: "raw" | "aggregated";
  role: string | null;

  hydrate: () => Promise<void>;
  markFalsePositive: (alertId: string) => Promise<void>;
  markTruePositive: (alertId: string) => Promise<void>;
  adopt: (alertId: string, actionText: string) => Promise<void>;
  reset: () => Promise<void>;
  setFilters: (patch: Partial<AlertFilters>) => void;
  setViewMode: (m: "raw" | "aggregated") => void;
  setRole: (r: string | null) => void;
}

const DEFAULT_FILTERS: AlertFilters = { sortBy: "priority", sortOrder: "asc" };

async function api(method: "GET" | "POST", body?: unknown): Promise<SocSnapshot> {
  const res = await fetch("/api/soc", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as SocSnapshot;
}

export const useSocStore = create<SocStore>()(
  persist(
    (set, get) => ({
      assets: [],
      alerts: [],
      learningMemory: {},
      dispositions: [],
      connectionMode: "online",
      status: "idle",
      filters: DEFAULT_FILTERS,
      viewMode: "raw",
      role: null,

      hydrate: async () => {
        set({ status: "loading" });
        try {
          const snap = await api("GET");
          set({ ...snap, connectionMode: "online", status: "ready" });
        } catch {
          // 降级:本地无镜像则灌种子,保证演示不空屏
          if (!get().alerts.length) {
            set({ assets: SEED_ASSETS, alerts: SEED_ALERTS, learningMemory: {}, dispositions: [] });
          }
          set({ connectionMode: "fallback", status: "ready" });
        }
      },

      markFalsePositive: async (alertId) => {
        try {
          const snap = await api("POST", { action: "false_positive", alertId });
          set({ ...snap, connectionMode: "online" });
        } catch {
          const { alerts, learningMemory } = get();
          const al = alerts.find((a) => a.id === alertId);
          if (!al) return;
          set({
            alerts: alerts.map((a) => (a.id === alertId ? { ...a, status: "false_positive" } : a)),
            learningMemory: applyFalsePositiveMemory(learningMemory, al.alertType),
            connectionMode: "fallback",
          });
        }
      },

      markTruePositive: async (alertId) => {
        try {
          const snap = await api("POST", { action: "true_positive", alertId });
          set({ ...snap, connectionMode: "online" });
        } catch {
          const { alerts, learningMemory } = get();
          const al = alerts.find((a) => a.id === alertId);
          if (!al) return;
          set({
            alerts: alerts.map((a) => (a.id === alertId ? { ...a, status: "pending" } : a)),
            learningMemory: applyTruePositiveMemory(learningMemory, al.alertType),
            connectionMode: "fallback",
          });
        }
      },

      adopt: async (alertId, actionText) => {
        try {
          const snap = await api("POST", { action: "adopt", alertId, actionText });
          set({ ...snap, connectionMode: "online" });
        } catch {
          const { alerts, dispositions } = get();
          const al = alerts.find((a) => a.id === alertId);
          if (!al) return;
          set({
            alerts: alerts.map((a) => (a.id === alertId ? { ...a, status: "adopted" } : a)),
            dispositions: [
              {
                id: `local-${alertId}-${dispositions.length}`,
                alertId,
                alertName: al.name,
                action: actionText,
                operator: "security",
                timestamp: new Date().toISOString(),
              },
              ...dispositions,
            ],
            connectionMode: "fallback",
          });
        }
      },

      reset: async () => {
        try {
          const snap = await api("POST", { action: "reset" });
          set({ ...snap, connectionMode: "online" });
        } catch {
          set({
            assets: SEED_ASSETS,
            alerts: SEED_ALERTS,
            learningMemory: {},
            dispositions: [],
            connectionMode: "fallback",
          });
        }
      },

      setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
      setViewMode: (m) => set({ viewMode: m }),
      setRole: (r) => set({ role: r }),
    }),
    {
      name: "guoshun-ai-soc",
      skipHydration: true, // 由 AppShell 在客户端挂载后手动 rehydrate,避免 SSR 水合不一致
      partialize: (s) => ({
        assets: s.assets,
        alerts: s.alerts,
        learningMemory: s.learningMemory,
        dispositions: s.dispositions,
      }),
    },
  ),
);
