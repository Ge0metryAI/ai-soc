// 展示元数据:严重度/优先级/状态/类型的颜色与标签 + 置信度条 + 时间格式化
import type { AlertStatus, AlertType, Priority, Severity } from "@/types";
import { ALERT_TYPE_LABEL, MITRE_MAP, SEVERITY_LABEL } from "@/lib/engine";
import { cn } from "@/lib/utils";

export const PRIORITY_META: Record<Priority, { label: string; cls: string; hex: string }> = {
  P0: { label: "P0", cls: "bg-red-500/15 text-red-400 ring-red-500/30", hex: "#ef4444" },
  P1: { label: "P1", cls: "bg-orange-500/15 text-orange-400 ring-orange-500/30", hex: "#f97316" },
  P2: { label: "P2", cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30", hex: "#f59e0b" },
  P3: { label: "P3", cls: "bg-slate-500/15 text-slate-300 ring-slate-500/30", hex: "#64748b" },
};

export const SEVERITY_META: Record<Severity, { cls: string }> = {
  critical: { cls: "bg-red-500/15 text-red-400 ring-red-500/30" },
  high: { cls: "bg-orange-500/15 text-orange-400 ring-orange-500/30" },
  medium: { cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30" },
  low: { cls: "bg-slate-500/15 text-slate-300 ring-slate-500/30" },
};

export const STATUS_META: Record<AlertStatus, { label: string; cls: string }> = {
  pending: { label: "待处置", cls: "bg-sky-500/15 text-sky-400 ring-sky-500/30" },
  adopted: { label: "已采纳", cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" },
  false_positive: { label: "误报", cls: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30" },
};

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PriorityBadge({ p }: { p: Priority }) {
  return <Pill className={PRIORITY_META[p].cls}>{PRIORITY_META[p].label}</Pill>;
}
export function SeverityBadge({ s }: { s: Severity }) {
  return <Pill className={SEVERITY_META[s].cls}>{SEVERITY_LABEL[s]}</Pill>;
}
export function StatusBadge({ s }: { s: AlertStatus }) {
  return <Pill className={STATUS_META[s].cls}>{STATUS_META[s].label}</Pill>;
}
export function TypeBadge({ t }: { t: AlertType }) {
  return <Pill className="bg-muted text-muted-foreground ring-border">{ALERT_TYPE_LABEL[t]}</Pill>;
}
export function MitreBadge({ t }: { t: AlertType }) {
  return (
    <Pill className="bg-violet-500/15 text-violet-300 ring-violet-500/30">ATT&CK {MITRE_MAP[t].id}</Pill>
  );
}

/** 白名单/核心资产豁免标记 —— 命中则该告警绝不被 AI 自动处置 */
export function ExemptBadge() {
  return <Pill className="bg-teal-500/15 text-teal-300 ring-teal-500/30">🛡 已豁免</Pill>;
}

/** 处置来源标记 —— 区分 AI 自动处置与人工采纳(用于一键恢复时精准识别 AI 动作) */
export function SourceBadge({ auto }: { auto: boolean }) {
  return auto ? (
    <Pill className="bg-violet-500/15 text-violet-300 ring-violet-500/30">AI 自动</Pill>
  ) : (
    <Pill className="bg-sky-500/15 text-sky-400 ring-sky-500/30">人工</Pill>
  );
}

/** 判断是否为外部(公网)IP —— 用于威胁情报富化提示 */
export function isExternalIp(ip: string): boolean {
  return !(
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-red-500" : value >= 60 ? "bg-orange-500" : value >= 40 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

/** 2026-06-08T09:12:00+08:00 -> 06-08 09:12 */
export function fmtTime(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : iso;
}
