"use client";

import { useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import { useSocStore } from "@/store/socStore";
import { aggregate, deriveAlerts } from "@/lib/engine";
import type { AggregatedEvent } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PriorityBadge, TypeBadge, fmtTime } from "@/components/soc/meta";

export function EventsView() {
  const assets = useSocStore((s) => s.assets);
  const rawAlerts = useSocStore((s) => s.alerts);
  const learning = useSocStore((s) => s.learningMemory);
  const alerts = useMemo(() => deriveAlerts(rawAlerts, learning, assets), [rawAlerts, learning, assets]);
  const events = useMemo(() => aggregate(alerts), [alerts]);
  const [active, setActive] = useState<AggregatedEvent | null>(null);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        按「同源 IP + 相同告警类型」聚合,≥2 条合并为一个事件,实现告警降噪。当前 {events.length} 个聚合事件。
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <Card key={e.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PriorityBadge p={e.priority} />
                <TypeBadge t={e.alertType} />
              </div>
              <span className="flex items-center gap-1 rounded bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">
                <GitMerge className="size-3" />
                {e.count} 条
              </span>
            </div>
            <div className="text-sm">
              源 IP <span className="font-medium">{e.sourceIp}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtTime(e.firstSeen)} ~ {fmtTime(e.lastSeen)}
            </div>
            <div className="text-xs text-muted-foreground">最高置信度 {e.maxConfidence}</div>
            <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setActive(e)}>
              查看攻击时间线
            </Button>
          </Card>
        ))}
        {!events.length && <Card className="p-6 text-sm text-muted-foreground">暂无聚合事件。</Card>}
      </div>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <PriorityBadge p={active.priority} />
                  攻击时间线
                </SheetTitle>
                <SheetDescription>
                  源 {active.sourceIp} · 合并 {active.count} 条告警
                </SheetDescription>
              </SheetHeader>
              <ol className="space-y-3 px-4 pb-4">
                {active.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="mt-1 size-2 shrink-0 rounded-full bg-sky-400" />
                    <div>
                      <div className="text-xs text-muted-foreground">{fmtTime(t.time)}</div>
                      <div className="text-sm">{t.alertName}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
