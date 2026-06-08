"use client";

import { useMemo, useState } from "react";
import { useSocStore } from "@/store/socStore";
import { useAiConfig } from "@/store/aiConfigStore";
import { ALERT_TYPE_LABEL, MITRE_MAP, aggregate, deriveAlerts, priorityRank } from "@/lib/engine";
import type { Alert, AlertFilters, AlertStatus, Priority, Severity } from "@/types";
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
  const role = useSocStore((s) => s.role);
  const canOperate = role !== "user1";

  const alerts = useMemo(() => deriveAlerts(rawAlerts, learning, assets), [rawAlerts, learning, assets]);
  const events = useMemo(() => aggregate(alerts), [alerts]);

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
      if (filters.sortBy === "confidence") c = a.confidence - b.confidence;
      else if (filters.sortBy === "priority") c = priorityRank(a.priority) - priorityRank(b.priority);
      else c = a.timestamp.localeCompare(b.timestamp);
      return c * dir;
    });
  }, [alerts, filters]);

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
            <NativeSelect
              value={filters.sortBy}
              onChange={(v) => setFilters({ sortBy: v as AlertFilters["sortBy"] })}
              options={[["priority", "按优先级"], ["confidence", "按置信度"], ["timestamp", "按时间"]]}
            />
            <NativeSelect
              value={filters.sortOrder}
              onChange={(v) => setFilters({ sortOrder: v as "asc" | "desc" })}
              options={[["asc", "升序"], ["desc", "降序"]]}
            />
          </>
        )}
      </div>

      {viewMode === "raw" ? (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>优先级</TableHead>
                <TableHead>告警</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>源 → 目的</TableHead>
                <TableHead>严重度</TableHead>
                <TableHead>置信度</TableHead>
                <TableHead>AI 建议</TableHead>
                <TableHead>状态</TableHead>
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
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {a.aiSuggestion ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge s={a.status} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {canOperate ? (
                      <div className="flex justify-end gap-1">
                        {a.aiSuggestion && a.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => setAdoptTarget(a)}>
                            采纳
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
            <DialogTitle>采纳 AI 处置建议</DialogTitle>
            <DialogDescription>{adoptTarget?.aiSuggestion}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdoptTarget(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (adoptTarget?.aiSuggestion) void adopt(adoptTarget.id, adoptTarget.aiSuggestion);
                setAdoptTarget(null);
              }}
            >
              确认采纳
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
      <div className="space-y-4 px-4 pb-4 text-sm">
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
  const enabled = useAiConfig((s) => s.enabled);
  const baseUrl = useAiConfig((s) => s.baseUrl);
  const apiKey = useAiConfig((s) => s.apiKey);
  const model = useAiConfig((s) => s.model);
  const [aiText, setAiText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function gen() {
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
          config: { baseUrl, apiKey, model },
        }),
      });
      const data = await res.json();
      if (res.ok) setAiText(data.suggestion || "(空响应)");
      else setErr(data.error || "生成失败");
    } catch (e) {
      setErr(String(e));
    }
    setLoading(false);
  }

  const canUseAi = enabled && !!apiKey;
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">AI 处置建议</span>
        {canUseAi && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => void gen()}
            disabled={loading}
          >
            {loading ? "生成中..." : "🤖 AI 生成"}
          </Button>
        )}
      </div>
      <div>{aiText ?? a.aiSuggestion ?? "(置信度/优先级未达阈值,暂不生成规则建议)"}</div>
      {aiText ? (
        <div className="mt-1 text-[10px] text-sky-400">由配置的 AI 模型({model})动态生成</div>
      ) : a.aiSuggestion ? (
        <div className="mt-1 text-[10px] text-muted-foreground">规则引擎模板生成</div>
      ) : null}
      {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
      {!canUseAi && (
        <div className="mt-1 text-[10px] text-muted-foreground">在「设置」中启用并配置 AI 后,可动态生成建议</div>
      )}
    </div>
  );
}

function AggregatedList({ events }: { events: ReturnType<typeof aggregate> }) {
  if (!events.length)
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        当前无可聚合事件(需同源 IP + 同类型 ≥2 条)。
      </Card>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {events.map((e) => (
        <Card key={e.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PriorityBadge p={e.priority} />
              <TypeBadge t={e.alertType} />
            </div>
            <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">合并 {e.count} 条</span>
          </div>
          <div className="mt-2 text-sm">源 {e.sourceIp}</div>
          <div className="text-xs text-muted-foreground">
            {fmtTime(e.firstSeen)} ~ {fmtTime(e.lastSeen)} · 最高置信度 {e.maxConfidence}
          </div>
        </Card>
      ))}
    </div>
  );
}
