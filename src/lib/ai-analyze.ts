"use client";
// 客户端 AI 分析封装:统一调 /api/ai-analyze,带模块级 id 缓存(避免重复网络往返)。
// 服务端也有缓存;双层缓存确保「自动触发」体感下成本可控。
import type { ChainAnalysis, EventAnalysis, PostureAnalysis } from "@/types";

type Mode = "chain" | "event" | "posture";
interface ResultMap {
  chain: ChainAnalysis;
  event: EventAnalysis;
  posture: PostureAnalysis;
}

const cache = new Map<string, unknown>();

/**
 * 调用 AI 分析。结果按 `mode:cacheKey` 缓存;cacheKey 应包含会随数据变化的字段(如 lastSeen/count),
 * 数据变了 key 就变、自动重算。force=true 跳过缓存强制刷新。
 */
export async function analyze<M extends Mode>(
  mode: M,
  payload: unknown,
  cacheKey: string,
  force = false,
): Promise<ResultMap[M]> {
  const key = `${mode}:${cacheKey}`;
  if (!force && cache.has(key)) return cache.get(key) as ResultMap[M];
  const res = await fetch("/api/ai-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, payload, cacheKey, force }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ai-analyze ${res.status}`);
  const data = (await res.json()) as ResultMap[M];
  // 只缓存真·AI 结果;规则兜底不缓存,模型恢复后自动重试出 AI
  if ((data as { source?: string }).source === "ai") cache.set(key, data);
  return data;
}
