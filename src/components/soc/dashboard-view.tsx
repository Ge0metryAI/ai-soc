"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, ArrowRight, CheckCheck, Flame, Gauge, ShieldCheck } from "lucide-react";
import { useSocStore } from "@/store/socStore";
import { aggregate, computeKpis, deriveAlerts, priorityRank } from "@/lib/engine";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ConfidenceBar, PRIORITY_META, PriorityBadge, TypeBadge, fmtTime } from "@/components/soc/meta";
import type { Priority } from "@/types";

export function DashboardView() {
  const assets = useSocStore((s) => s.assets);
  const rawAlerts = useSocStore((s) => s.alerts);
  const learning = useSocStore((s) => s.learningMemory);
  const dispositions = useSocStore((s) => s.dispositions);

  const alerts = useMemo(() => deriveAlerts(rawAlerts, learning, assets), [rawAlerts, learning, assets]);
  const events = useMemo(() => aggregate(alerts), [alerts]);
  const kpis = useMemo(() => computeKpis(alerts, events), [alerts, events]);

  const priorityData = useMemo(() => {
    const order: Priority[] = ["P0", "P1", "P2", "P3"];
    const active = alerts.filter((a) => a.status !== "false_positive");
    return order.map((p) => ({
      name: p,
      value: active.filter((a) => a.priority === p).length,
      fill: PRIORITY_META[p].hex,
    }));
  }, [alerts]);

  const confidenceData = useMemo(() => {
    const buckets = [
      { name: "0-39", min: 0, max: 39 },
      { name: "40-59", min: 40, max: 59 },
      { name: "60-79", min: 60, max: 79 },
      { name: "80-100", min: 80, max: 100 },
    ];
    const active = alerts.filter((a) => a.status !== "false_positive");
    return buckets.map((b) => ({
      name: b.name,
      value: active.filter((a) => a.confidence >= b.min && a.confidence <= b.max).length,
    }));
  }, [alerts]);

  const top5 = useMemo(
    () =>
      [...alerts]
        .filter((a) => a.status === "pending")
        .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.confidence - a.confidence)
        .slice(0, 5),
    [alerts],
  );

  const priorityConfig: ChartConfig = { value: { label: "数量" } };
  const confidenceConfig: ChartConfig = { value: { label: "告警数", color: "#38bdf8" } };

  return (
    <div className="space-y-6">
      {/* AI 智能降噪 —— 头号能力,显眼呈现 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-emerald-400" />
          AI 智能降噪
          <span className="text-xs font-normal text-muted-foreground">告警聚合 · 噪声抑制</span>
        </div>
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">{kpis.totalAlerts}</div>
              <div className="text-xs text-muted-foreground">原始告警</div>
            </div>
            <div className="flex flex-col items-center text-sky-400">
              <ArrowRight className="size-5" />
              <span className="text-[10px]">AI 聚合</span>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums text-sky-400">{kpis.eventCount}</div>
              <div className="text-xs text-muted-foreground">聚合事件</div>
            </div>
          </div>
          <div className="w-full flex-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">降噪率</span>
              <span className="font-semibold text-emerald-400">{Math.round(kpis.denoiseRate * 100)}%</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.round(kpis.denoiseRate * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              按「同源 IP + 告警类型」自动归并,减少 {Math.max(0, kpis.totalAlerts - kpis.eventCount)}{" "}
              条噪声,让分析师聚焦真正事件
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi icon={<Activity className="size-4" />} label="今日告警总数" value={kpis.totalAlerts} />
        <Kpi icon={<Flame className="size-4 text-red-400" />} label="待处置高危" value={kpis.pendingHighRisk} />
        <Kpi icon={<Gauge className="size-4" />} label="平均置信度" value={kpis.avgConfidence} />
        <Kpi
          icon={<AlertTriangle className="size-4 text-amber-400" />}
          label="误报率"
          value={`${Math.round(kpis.falsePositiveRate * 100)}%`}
        />
        <Kpi
          icon={<CheckCheck className="size-4 text-emerald-400" />}
          label="处置率"
          value={`${Math.round(kpis.dispositionRate * 100)}%`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">优先级分布</div>
          <ChartContainer config={priorityConfig} className="h-[220px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
              <Pie data={priorityData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                {priorityData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            {priorityData.map((d) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: d.fill }} />
                {d.name} {d.value}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">置信度分布</div>
          <ChartContainer config={confidenceConfig} className="h-[220px] w-full">
            <BarChart data={confidenceData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">高危告警 Top5</div>
          <div className="space-y-2">
            {top5.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <PriorityBadge p={a.priority} />
                  <TypeBadge t={a.alertType} />
                  <span className="truncate text-xs text-muted-foreground">
                    {a.sourceIp} → {a.destIp}
                  </span>
                </div>
                <ConfidenceBar value={a.confidence} />
              </div>
            ))}
            {!top5.length && <div className="text-sm text-muted-foreground">暂无待处置告警</div>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">最近处置</div>
          <div className="space-y-2">
            {dispositions.slice(0, 5).map((d) => (
              <div key={d.id} className="rounded-md border p-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{d.alertName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(d.timestamp)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{d.action}</div>
              </div>
            ))}
            {!dispositions.length && <div className="text-sm text-muted-foreground">暂无处置记录</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
