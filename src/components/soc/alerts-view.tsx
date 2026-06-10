"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSocStore } from "@/store/socStore";
import { useAiStatus } from "@/store/aiConfigStore";
import { ALERT_TYPE_LABEL, MITRE_MAP, aggregateEvents, checkExemption, deriveAlerts, priorityRank } from "@/lib/engine";
import type { Alert, AlertFilters, AlertStatus, Priority, Severity, SocEvent } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ConfidenceBar,
  ExemptBadge,
  MitreBadge,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  TypeBadge,
  fmtTime,
  isExternalIp,
} from "@/components/soc/meta";

function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function AlertsView() {
  const assets = useSocStore((s) => s.assets);
  const rawAlerts = useSocStore((s) => s.alerts);
  const learning = useSocStore((s) => s.learningMemory);
  const filters = useSocStore((s) => s.filters);
  const setFilters = useSocStore((s) => s.setFilters);
  const viewMode = useSocStore((s) => s.viewMode);
  const setViewMode = useSocStore((s) => s.setViewMode);
  const markFalsePositive = useSocStore((s) => s.markFalsePositive);
  const markTruePositive = useSocStore((s) => s.markTruePositive);
  const adopt = useSocStore((s) => s.adopt);
  const whitelist = useSocStore((s) => s.whitelist);
  const aiLive = useSocStore((s) => s.aiLive);
  const role = useSocStore((s) => s.role);
  const canOperate = role !== "user1";

  const alerts = useMemo(() => deriveAlerts(rawAlerts, learning, assets), [rawAlerts, learning, assets]);
  const events = useMemo(() => aggregateEvents(alerts), [alerts]);
  const assetMap = useMemo(() => Object.fromEntries(assets.map((x) => [x.ip, x])), [assets]);

  const [detail, setDetail] = useState<Alert | null>(null);
  const [adoptTarget, setAdoptTarget] = useState<Alert | null>(null);

  const filtered = useMemo(() => {
    const list = alerts.filter((a) => {
      if (filters.severity && a.severity !== filters.severity) return false;
      if (filters.priority && a.priority !== filters.priority) return false;
      if (filters.status && a.status !== filters.status) return false;
      return true;
    });
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let c = 0;
      switch (filters.sortBy) {
        case "confidence":
          c = a.confidence - b.confidence;
          break;
        case "priority":
          c = priorityRank(a.priority) - priorityRank(b.priority);
          break;
        case "name":
          c = a.name.localeCompare(b.name, "zh");
          break;
        case "alertType":
          c = a.alertType.localeCompare(b.alertType);
          break;
        case "sourceIp":
          c = a.sourceIp.localeCompare(b.sourceIp);
          break;
        case "severity": {
          const R = { critical: 0, high: 1, medium: 2, low: 3 } as const;
          c = R[a.severity] - R[b.severity];
          break;
        }
        case "status": {
          const R = { pending: 0, adopted: 1, false_positive: 2 } as const;
          c = R[a.status] - R[b.status];
          break;
        }
        default:
          c = a.timestamp.localeCompare(b.timestamp);
      }
      return c * dir;
    });
  }, [alerts, filters]);

  const sortableHead = (col: AlertFilters["sortBy"], label: string) => {
    const active = filters.sortBy === col;
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap hover:text-foreground"
        onClick={() =>
          active
            ? setFilters({ sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })
            : setFilters({ sortBy: col, sortOrder: "asc" })
        }
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-[10px] text-sky-400">{active ? (filters.sortOrder === "asc" ? "▲" : "▼") : ""}</span>
        </span>
      </TableHead>
    );
  };

  // 采纳弹窗使用的建议文案:优先 AI(aiLive),否则规则模板
  const adoptSuggestion = adoptTarget ? aiLive[adoptTarget.id] ?? adoptTarget.aiSuggestion : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex rounded-md border p-0.5">
          <button onClick={() => setViewMode("raw")} className={toggleCls(viewMode === "raw")}>
            原始告警
          </button>
          <button onClick={() => setViewMode("aggregated")} className={toggleCls(viewMode === "aggregated")}>
            聚合事件
          </button>
        </div>
        {viewMode === "raw" && (
          <>
            <NativeSelect
              value={filters.priority ?? "all"}
              onChange={(v) => setFilters({ priority: v === "all" ? undefined : (v as Priority) })}
              options={[["all", "全部优先级"], ["P0", "P0"], ["P1", "P1"], ["P2", "P2"], ["P3", "P3"]]}
            />
            <NativeSelect
              value={filters.severity ?? "all"}
              onChange={(v) => setFilters({ severity: v === "all" ? undefined : (v as Severity) })}
              options={[["all", "全部严重度"], ["critical", "严重"], ["high", "高"], ["medium", "中"], ["low", "低"]]}
            />
            <NativeSelect
              value={filters.status ?? "all"}
              onChange={(v) => setFilters({ status: v === "all" ? undefined : (v as AlertStatus) })}
              options={[["all", "全部状态"], ["pending", "待处置"], ["adopted", "已采纳"], ["false_positive", "误报"]]}
            />
            <span className="ml-1 text-xs text-muted-foreground">点击列头排序 ↕</span>
          </>
        )}
      </div>

      {viewMode === "raw" ? (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {sortableHead("priority", "优先级")}
                {sortableHead("name", "告警")}
                {sortableHead("alertType", "类型")}
                {sortableHead("sourceIp", "源 → 目的")}
                {sortableHead("severity", "严重度")}
                {sortableHead("confidence", "置信度")}
                <TableHead>AI 建议</TableHead>
                {sortableHead("status", "状态")}
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => setDetail(a)}>
                  <TableCell>
                    <PriorityBadge p={a.priority} />
                  </TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <TypeBadge t={a.alertType} />
                      <MitreBadge t={a.alertType} />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.sourceIp} → {a.destIp}
                  </TableCell>
                  <TableCell>
                    <SeverityBadge s={a.severity} />
                  </TableCell>
                  <TableCell>
                    <ConfidenceBar value={a.confidence} />
                  </TableCell>
                  <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                    {(() => {
                      const live = aiLive[a.id];
                      const text = live ?? a.aiSuggestion;
                      if (!text) return "—";
                      return (
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 truncate" title={text}>
                            {text}
                          </span>
                          <span
                            className={
                              live
                                ? "shrink-0 rounded bg-sky-500/15 px-1 text-[9px] text-sky-400"
                                : "shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground"
                            }
                          >
                            {live ? "AI" : "规则"}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StatusBadge s={a.status} />
                      {checkExemption(a, whitelist, assetMap).exempt && <ExemptBadge />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {canOperate ? (
                      <div className="flex justify-end gap-1">
                        {a.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => setAdoptTarget(a)}>
                            {(aiLive[a.id] ?? a.aiSuggestion) ? "采纳" : "处置"}
                          </Button>
                        )}
                        {a.status !== "false_positive" ? (
                          <Button size="sm" variant="ghost" onClick={() => void markFalsePositive(a.id)}>
                            误报
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => void markTruePositive(a.id)}>
                            恢复
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">只读</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <AggregatedList events={events} />
      )}

      {/* 详情抽屉:研判依据(可解释) */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          {detail && <AlertDetail a={detail} />}
        </SheetContent>
      </Sheet>

      {/* 采纳确认 */}
      <Dialog open={!!adoptTarget} onOpenChange={(o) => !o && setAdoptTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adoptSuggestion ? "采纳 AI 处置建议" : "人工处置告警"}</DialogTitle>
            <DialogDescription>
              {adoptSuggestion ?? "该告警未达 AI 自动建议阈值,确认按人工研判进行处置?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdoptTarget(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (adoptTarget) void adopt(adoptTarget.id, adoptSuggestion ?? "人工研判后处置");
                setAdoptTarget(null);
              }}
            >
              确认处置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toggleCls(active: boolean) {
  return `rounded px-3 py-1 text-sm transition-colors ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
  }`;
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function AlertDetail({ a }: { a: Alert }) {
  const b = a.breakdown;
  const whitelist = useSocStore((s) => s.whitelist);
  const assets = useSocStore((s) => s.assets);
  const exemption = useMemo(() => {
    const assetMap = Object.fromEntries(assets.map((x) => [x.ip, x]));
    return checkExemption(a, whitelist, assetMap);
  }, [a, whitelist, assets]);
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <PriorityBadge p={a.priority} />
          {a.name}
        </SheetTitle>
        <SheetDescription>
          {a.sourceIp} → {a.destIp} · {fmtTime(a.timestamp)}
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 pb-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <TypeBadge t={a.alertType} />
          <MitreBadge t={a.alertType} />
          <SeverityBadge s={a.severity} />
          <StatusBadge s={a.status} />
        </div>
        <div className="rounded-lg border p-3 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">MITRE ATT&CK</div>
          <div className="flex items-center justify-between">
            <span>
              {MITRE_MAP[a.alertType].id} · {MITRE_MAP[a.alertType].technique}
            </span>
            <span className="text-violet-300">{MITRE_MAP[a.alertType].tactic}</span>
          </div>
        </div>
        <div className="rounded-lg border p-3 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">威胁情报富化</div>
          <div className="flex items-center justify-between">
            <span>源 IP {a.sourceIp}</span>
            <span className={isExternalIp(a.sourceIp) ? "text-amber-400" : "text-muted-foreground"}>
              {isExternalIp(a.sourceIp) ? "外部公网 IP · 建议威胁情报查询" : "内网地址"}
            </span>
          </div>
        </div>
        {a.evidence && (
          <div className="rounded-lg border p-3 text-xs">
            <div className="mb-1 font-medium text-muted-foreground">原始告警证据(供人工复核)</div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[11px] leading-5">
              {a.evidence}
            </pre>
          </div>
        )}
        {exemption.exempt && (
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-200">
            🛡 命中白名单豁免:{exemption.reason} —— 自动模式下绝不会被 AI 自动处置。
          </div>
        )}
        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">研判依据(可解释规则引擎)</div>
          <div className="mb-2 flex items-center justify-between">
            <span>综合置信度</span>
            <span className="text-lg font-semibold tabular-nums">{a.confidence}</span>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex justify-between">
              <span>类型基线({ALERT_TYPE_LABEL[a.alertType]})</span>
              <span className="tabular-nums">{b.base}</span>
            </li>
            <li className="flex justify-between">
              <span>资产重要性加权</span>
              <span className="tabular-nums">{sign(b.importanceBonus)}</span>
            </li>
            <li className="flex justify-between">
              <span>严重度加权</span>
              <span className="tabular-nums">{sign(b.severityBonus)}</span>
            </li>
            <li className="flex justify-between">
              <span>误报学习调整</span>
              <span className="tabular-nums">{sign(b.learningAdj)}</span>
            </li>
            <li className="mt-1 flex justify-between border-t pt-1 text-foreground">
              <span>命中规则</span>
              <span>{b.hitRule}</span>
            </li>
          </ul>
        </div>
        <AiSuggestionBlock a={a} />
      </div>
    </>
  );
}

function AiSuggestionBlock({ a }: { a: Alert }) {
  const configured = useAiStatus((s) => s.configured);
  const cached = useSocStore((s) => s.aiLive[a.id]); // 该告警已生成过的 AI 建议(store 缓存)
  const setAiSuggestion = useSocStore((s) => s.setAiSuggestion);
  const [aiText, setAiText] = useState<string | null>(cached ?? null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 保存当前进行中的请求控制器:每次新生成(自动/手动)先取消上一次在途请求,
  // 既避免并发「后到旧响应」覆盖新告警建议,也消除开发期 StrictMode 双挂载导致的重复生成。
  const abortRef = useRef<AbortController | null>(null);

  async function gen() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setErr(null);
    setAiText(null);
    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert: {
            name: a.name,
            alertType: a.alertType,
            sourceIp: a.sourceIp,
            destIp: a.destIp,
            severity: a.severity,
            confidence: a.confidence,
            priority: a.priority,
          },
        }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (ctrl.signal.aborted) return; // 已被取消:不写入过期状态
      if (res.ok) {
        const text: string = data.suggestion || "(空响应)";
        setAiText(text);
        if (data.suggestion) setAiSuggestion(a.id, data.suggestion); // 回写 store → 告警表"AI 建议"列实时更新并缓存
      } else {
        setErr(data.error || "生成失败");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // 被新请求/卸载取消:静默忽略
      if (!ctrl.signal.aborted) setErr(String(e));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  // 打开告警详情即自动生成 AI 建议(已配置 key 时);下方按钮保留为手动重新生成。
  // 清理函数在卸载/切换告警时取消在途请求 —— 这正是 StrictMode 要暴露的「缺失清理」。
  useEffect(() => {
    if (!configured) return;
    if (cached) {
      setAiText(cached); // 已有缓存:直接展示,不重复调用模型(手动「重新生成」仍可刷新)
      return;
    }
    void gen();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, configured]);

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">AI 处置建议</span>
        {configured && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => void gen()}
            disabled={loading}
          >
            {loading ? "生成中..." : aiText ? "🔄 重新生成" : "🤖 AI 生成"}
          </Button>
        )}
      </div>
      <div>{aiText ?? a.aiSuggestion ?? "(置信度/优先级未达阈值,暂不生成规则建议)"}</div>
      {aiText ? (
        <div className="mt-1 text-[10px] text-sky-400">由服务端 AI 模型动态生成</div>
      ) : a.aiSuggestion ? (
        <div className="mt-1 text-[10px] text-muted-foreground">规则引擎模板生成</div>
      ) : null}
      {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
      {!configured && (
        <div className="mt-1 text-[10px] text-muted-foreground">服务端配置 AI_API_KEY 后,可动态生成建议</div>
      )}
    </div>
  );
}

function AggregatedList({ events }: { events: SocEvent[] }) {
  if (!events.length)
    return <Card className="p-6 text-sm text-muted-foreground">当前无聚合事件。</Card>;
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <Card key={e.id} className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PriorityBadge p={e.priority} />
              <TypeBadge t={e.alertType} />
            </div>
            {e.merged ? (
              <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">合并 {e.count} 条</span>
            ) : (
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">独立</span>
            )}
          </div>
          <div className="mt-2 text-sm">{e.merged ? `${e.sourceIp} · 同类重复` : e.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>源 {e.sourceIp}</span>
            {e.inChain && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">⊕ 攻击链</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtTime(e.firstSeen)}
            {e.merged ? ` ~ ${fmtTime(e.lastSeen)}` : ""} · 最高置信度 {e.maxConfidence}
          </div>
        </Card>
      ))}
    </div>
  );
}
