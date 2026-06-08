// AI 增强状态(只读) —— 密钥在服务端,前端只知道"是否已配置 + 模型名",不接触 key
"use client";

import { create } from "zustand";

interface AiStatus {
  configured: boolean;
  model: string | null;
  checked: boolean;
  check: () => Promise<void>;
}

export const useAiStatus = create<AiStatus>((set) => ({
  configured: false,
  model: null,
  checked: false,
  check: async () => {
    try {
      const r = await fetch("/api/ai-suggest", { cache: "no-store" });
      const j = await r.json();
      set({ configured: !!j.configured, model: j.model ?? null, checked: true });
    } catch {
      set({ configured: false, checked: true });
    }
  },
}));
