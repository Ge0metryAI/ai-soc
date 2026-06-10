// 客户端状态层 —— 在线走 /api/soc(Turso),异常自动降级 localStorage 镜像
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AlertFilters,
  Asset,
  ConnectionMode,
  DispositionMode,
  DispositionRecord,
  LearningMemory,
  RawAlert,
  SocSnapshot,
  WhitelistEntry,
} from "@/types";
import {
  applyFalsePositiveMemory,
  applyTruePositiveMemory,
  checkExemption,
  deriveAlerts,
  generateSuggestion,
  isAutoEligible,
} from "@/lib/engine";
import { SEED_ALERTS, SEED_ASSETS } from "@/lib/seed";

interface SocStore {
  assets: Asset[];
  alerts: RawAlert[];
  learningMemory: LearningMemory;
  dispositions: DispositionRecord[];
  dispositionMode: DispositionMode;
  whitelist: WhitelistEntry[];
  connectionMode: ConnectionMode;
  status: "idle" | "loading" | "ready";
  filters: AlertFilters;
  viewMode: "raw" | "aggregated";
  role: string | null;
  /** 按需生成的 AI 处置建议:alertId → 建议文本(打开告警时回写,告警表"AI 建议"列据此实时反映 AI 结果) */
  aiLive: Record<string, string>;

  hydrate: () => Promise<void>;
  markFalsePositive: (alertId: string) => Promise<void>;
  markTruePositive: (alertId: string) => Promise<void>;
  adopt: (alertId: string, actionText: string) => Promise<void>;
  setDispositionMode: (mode: DispositionMode) => Promise<void>;
  addWhitelist: (value: string, kind: "ip" | "cidr", note?: string) => Promise<void>;
  removeWhitelist: (id: string) => Promise<void>;
  revoke: (dispositionId: string) => Promise<void>;
  restoreAllAuto: () => Promise<void>;
  runAutoDisposition: () => Promise<void>;
  reset: () => Promise<void>;
  setFilters: (patch: Partial<AlertFilters>) => void;
  setViewMode: (m: "raw" | "aggregated") => void;
  setRole: (r: string | null) => void;
  setAiSuggestion: (alertId: string, text: string) => void;
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
      dispositionMode: "advisory",
      whitelist: [],
      connectionMode: "online",
      status: "idle",
      filters: DEFAULT_FILTERS,
      viewMode: "raw",
      role: null,
      aiLive: {},

      hydrate: async () => {
        set({ status: "loading" });
        try {
          const snap = await api("GET");
          set({ ...snap, connectionMode: "online", status: "ready" });
        } catch {
          // 降级:本地无镜像则灌种子,保证演示不空屏
          if (!get().alerts.length) {
            set({
              assets: SEED_ASSETS,
              alerts: SEED_ALERTS,
              learningMemory: {},
              dispositions: [],
              dispositionMode: "advisory",
              whitelist: [],
            });
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
          const { alerts, dispositions, dispositionMode } = get();
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
                mode: dispositionMode,
                auto: false,
                revoked: false,
              },
              ...dispositions,
            ],
            connectionMode: "fallback",
          });
        }
      },

      setDispositionMode: async (mode) => {
        try {
          const snap = await api("POST", { action: "set_mode", mode });
          set({ ...snap, connectionMode: "online" });
        } catch {
          set({ dispositionMode: mode, connectionMode: "fallback" });
        }
      },

      addWhitelist: async (value, kind, note) => {
        try {
          const snap = await api("POST", { action: "wl_add", whitelist: { value, kind, note } });
          set({ ...snap, connectionMode: "online" });
        } catch {
          const { whitelist } = get();
          set({
            whitelist: [
              {
                id: `local-wl-${Date.now()}`,
                value: value.trim(),
                kind,
                note: note?.trim() || undefined,
                createdAt: new Date().toISOString(),
              },
              ...whitelist,
            ],
            connectionMode: "fallback",
          });
        }
      },

      removeWhitelist: async (id) => {
        try {
          const snap = await api("POST", { action: "wl_remove", whitelistId: id });
          set({ ...snap, connectionMode: "online" });
        } catch {
          set({ whitelist: get().whitelist.filter((w) => w.id !== id), connectionMode: "fallback" });
        }
      },

      revoke: async (dispositionId) => {
        try {
          const snap = await api("POST", { action: "revoke", dispositionId });
          set({ ...snap, connectionMode: "online" });
        } catch {
          const { dispositions, alerts } = get();
          const d = dispositions.find((x) => x.id === dispositionId && !x.revoked);
          if (!d) return;
          set({
            dispositions: dispositions.map((x) => (x.id === dispositionId ? { ...x, revoked: true } : x)),
            alerts: alerts.map((a) => (a.id === d.alertId ? { ...a, status: "pending" } : a)),
            connectionMode: "fallback",
          });
        }
      },

      restoreAllAuto: async () => {
        try {
          const snap = await api("POST", { action: "restore_all" });
          set({ ...snap, connectionMode: "online" });
        } catch {
          const { dispositions, alerts } = get();
          const autoAlertIds = new Set(
            dispositions.filter((d) => d.auto && !d.revoked).map((d) => d.alertId),
          );
          set({
            dispositions: dispositions.map((d) => (d.auto && !d.revoked ? { ...d, revoked: true } : d)),
            alerts: alerts.map((a) => (autoAlertIds.has(a.id) ? { ...a, status: "pending" } : a)),
            connectionMode: "fallback",
          });
        }
      },

      runAutoDisposition: async () => {
        try {
          const snap = await api("POST", { action: "auto_dispose" });
          set({ ...snap, connectionMode: "online" });
        } catch {
          // 降级:本地按引擎资格 + 白名单豁免自动处置(与服务端同规则)
          const { alerts, assets, learningMemory, whitelist, dispositions } = get();
          const assetMap = Object.fromEntries(assets.map((a) => [a.ip, a]));
          const derived = deriveAlerts(alerts, learningMemory, assets);
          const newDisp = [...dispositions];
          let changed = false;
          const nextAlerts = alerts.map((raw) => {
            const a = derived.find((d) => d.id === raw.id);
            if (!a || !isAutoEligible(a) || checkExemption(a, whitelist, assetMap).exempt) return raw;
            changed = true;
            newDisp.unshift({
              id: `local-auto-${a.id}-${Date.now()}`,
              alertId: a.id,
              alertName: a.name,
              action: generateSuggestion(a, a.confidence, a.priority) ?? "AI 自动处置",
              operator: "AI-自动",
              timestamp: new Date().toISOString(),
              mode: "auto",
              auto: true,
              revoked: false,
            });
            return { ...raw, status: "adopted" as const };
          });
          if (changed) set({ alerts: nextAlerts, dispositions: newDisp, connectionMode: "fallback" });
        }
      },

      reset: async () => {
        try {
          const snap = await api("POST", { action: "reset" });
          set({ ...snap, aiLive: {}, connectionMode: "online" });
        } catch {
          set({
            assets: SEED_ASSETS,
            alerts: SEED_ALERTS,
            learningMemory: {},
            dispositions: [],
            dispositionMode: "advisory",
            whitelist: [],
            aiLive: {},
            connectionMode: "fallback",
          });
        }
      },

      setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
      setViewMode: (m) => set({ viewMode: m }),
      setRole: (r) => set({ role: r }),
      // AI 建议回写:打开告警生成后写入,告警表"AI 建议"列据此实时更新并缓存(本机持久,避免重复调用)
      setAiSuggestion: (alertId, text) => set({ aiLive: { ...get().aiLive, [alertId]: text } }),
    }),
    {
      name: "guoshun-ai-soc",
      skipHydration: true, // 由 AppShell 在客户端挂载后手动 rehydrate,避免 SSR 水合不一致
      partialize: (s) => ({
        assets: s.assets,
        alerts: s.alerts,
        learningMemory: s.learningMemory,
        dispositions: s.dispositions,
        dispositionMode: s.dispositionMode,
        whitelist: s.whitelist,
        aiLive: s.aiLive,
      }),
    },
  ),
);
