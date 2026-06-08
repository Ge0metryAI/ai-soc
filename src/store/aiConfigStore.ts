// 可选 AI 增强配置(兼容 OpenAI 接口)—— 存浏览器 localStorage,用户自行配置
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface AiConfigStore extends AiConfig {
  setConfig: (patch: Partial<AiConfig>) => void;
}

export const useAiConfig = create<AiConfigStore>()(
  persist(
    (set) => ({
      enabled: false,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
      setConfig: (patch) => set(patch),
    }),
    { name: "guoshun-ai-config", skipHydration: true },
  ),
);
