"use client";

import { useMemo, useState } from "react";
import { GitMerge, ShieldAlert } from "lucide-react";
import { useSocStore } from "@/store/socStore";
import { aggregateAttackChains, aggregateEvents, deriveAlerts } from "@/lib/engine";
import type { AttackChain, SocEvent } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MitreBadge, PriorityBadge, TypeBadge, fmtTime, isExternalIp } from "@/components/soc/meta";

/** 取链内去重后的战术阶段序列(已按杀伤链顺序排列) */
function stageFlow(chain: AttackChain): string[] {
  const seen = new Set<string>();
  const flow: string[] = [];
  for (const s of chain.steps) {
    if (!seen.has(s.tactic)) {
      seen.add(s.tactic);
      flow.push(s.tactic);
    }
  }
  return flow;
}

export function EventsView() {
  const assets = useSocStore((s) => s.assets);
  const rawAlerts = useSocStore((s) => s.alerts);
  const learning = useSocStore((s) => s.learningMemory);
  const alerts = useMemo(() => deriveAlerts(rawAlerts, learning, assets), [rawAlerts, learning, assets]);
  const chains = useMemo(() => aggregateAttackChains(alerts), [alerts]);
  const events = useMemo(() => aggregateEvents(alerts), [alerts]);

  const multiStageChains = chains.filter((c) => c.stageCount >= 2);
  const activeCount = alerts.filter((a) => a.status !== "false_positive").length;
  const denoise = activeCount > 0 ? Math.round((1 - events.length / activeCount) * 100) : 0;

  const [activeChain, setActiveChain] = useState<AttackChain | null>(null);
  const [activeEvent, setActiveEvent] = useState<SocEvent | null>(null);

  return (
    <div className="space-y-5">
      {/* 攻击链置顶高亮区 */}
      {multiStageChains.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="size-4 text-red-400" />
            检测到多阶段攻击链
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400">
              {multiStageChains.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {multiStageChains.map((c) => {
              const flow = stageFlow(c);
              return (
                <Card
                  key={c.id}
                  className="flex flex-col gap-2 border-red-500/30 bg-red-500/5 p-4 ring-1 ring-red-500/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PriorityBadge p={c.priority} />
                      <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                        {c.stageCount} 阶段杀伤链
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.count} 条告警</span>
                  </div>
                  <div className="text-sm">
                    攻击者 <span className="font-medium">{c.sourceIp}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {isExternalIp(c.sourceIp) ? "· 外部公网" : "· 内网"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {flow.map((t, i) => (
                      <span key={t} className="flex items-center gap-1">
                        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-xs text-violet-300">{t}</span>
                        {i < flow.length - 1 && <span className="text-xs text-muted-foreground">→</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtTime(c.firstSeen)} ~ {fmtTime(c.lastSeen)} · 最高置信度 {c.maxConfidence}
                  </div>
                  <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setActiveChain(c)}>
                    查看杀伤链时间线
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 聚合事件主体 */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <GitMerge className="size-4" />
          聚合事件 <span className="font-medium text-foreground">{events.length}</span> 个
          <span>· 原始 {activeCount} 条告警归并,降噪率</span>
          <span className="font-medium text-emerald-400">{denoise}%</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Card key={e.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PriorityBadge p={e.priority} />
                  <TypeBadge t={e.alertType} />
                </div>
                {e.merged ? (
                  <span className="flex items-center gap-1 rounded bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">
                    <GitMerge className="size-3" />
                    合并 {e.count} 条
                  </span>
                ) : (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">独立</span>
                )}
              </div>
              <div className="text-sm">{e.merged ? `${e.sourceIp} · 同类重复` : e.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                源 {e.sourceIp} {isExternalIp(e.sourceIp) ? "· 外部" : "· 内网"}
                {e.inChain && (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">⊕ 攻击链</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtTime(e.firstSeen)}
                {e.merged ? ` ~ ${fmtTime(e.lastSeen)}` : ""} · 置信度 {e.maxConfidence}
              </div>
              <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setActiveEvent(e)}>
                查看详情
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* 攻击链抽屉:杀伤链阶段时间线 */}
      <Sheet open={!!activeChain} onOpenChange={(o) => !o && setActiveChain(null)}>
        <SheetContent side="right" className="w-[440px] sm:max-w-[440px]">
          {activeChain && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <PriorityBadge p={activeChain.priority} />
                  攻击链 · {activeChain.stageCount} 阶段 / {activeChain.count} 告警
                </SheetTitle>
                <SheetDescription>
                  攻击者 {activeChain.sourceIp} · {fmtTime(activeChain.firstSeen)} ~ {fmtTime(activeChain.lastSeen)}
                </SheetDescription>
              </SheetHeader>
              <ol className="space-y-4 px-5 pb-6 pt-2">
                {activeChain.steps.map((s, i) => (
                  <li key={i} className="relative flex gap-3 pl-5">
                    {i < activeChain.steps.length - 1 && (
                      <span
                        className="absolute left-[5px] top-4 h-[calc(100%+0.3rem)] w-px bg-border"
                        aria-hidden
                      />
                    )}
                    <span className="absolute left-0 top-1.5 size-2.5 shrink-0 rounded-full bg-red-400 ring-2 ring-red-500/20" />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-300">
                          阶段{i + 1} · {s.tactic}
                        </span>
                        <MitreBadge t={s.alertType} />
                      </div>
                      <div className="text-sm">{s.alertName}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{fmtTime(s.time)}</span>
                        <TypeBadge t={s.alertType} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 聚合事件抽屉:归并明细时间线 */}
      <Sheet open={!!activeEvent} onOpenChange={(o) => !o && setActiveEvent(null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          {activeEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <PriorityBadge p={activeEvent.priority} />
                  {activeEvent.merged ? `合并事件 · ${activeEvent.count} 条` : "独立告警"}
                </SheetTitle>
                <SheetDescription>
                  源 {activeEvent.sourceIp} · 最高置信度 {activeEvent.maxConfidence}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-4 pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge t={activeEvent.alertType} />
                  <MitreBadge t={activeEvent.alertType} />
                  {activeEvent.inChain && (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400">
                      ⊕ 隶属多阶段攻击链
                    </span>
                  )}
                </div>
                <ol className="space-y-3">
                  {activeEvent.timeline.map((t, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-1 size-2 shrink-0 rounded-full bg-sky-400" />
                      <div>
                        <div className="text-xs text-muted-foreground">{fmtTime(t.time)}</div>
                        <div className="text-sm">{t.alertName}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
