"use client";

import { useEffect, useState } from "react";
import { useSocStore } from "@/store/socStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SourceBadge, fmtTime } from "@/components/soc/meta";

export function DispositionsView() {
  const dispositions = useSocStore((s) => s.dispositions);
  const revoke = useSocStore((s) => s.revoke);
  const restoreAllAuto = useSocStore((s) => s.restoreAllAuto);
  const role = useSocStore((s) => s.role);
  const canOperate = role !== "user1";

  const autoActive = dispositions.filter((d) => d.auto && !d.revoked).length;
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  // 成功/失败反馈做成"轻提示":4 秒后自动消失,避免点击后无任何可见变化
  useEffect(() => {
    if (!restoreMsg) return;
    const t = setTimeout(() => setRestoreMsg(null), 4000);
    return () => clearTimeout(t);
  }, [restoreMsg]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          共 {dispositions.length} 条处置记录,其中 AI 自动处置(未撤销){autoActive} 条。撤销将使告警回到待处置并模拟解除封禁,记录保留用于审计。
        </p>
        {canOperate && (
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10"
              disabled={autoActive === 0}
              title={autoActive === 0 ? "当前没有可恢复的 AI 自动处置(仅在自动处置模式下产生)" : undefined}
              onClick={() => {
                const n = autoActive;
                if (window.confirm(`确认一键恢复全部 ${n} 条 AI 自动处置?相关告警将回到待处置状态。`)) {
                  void restoreAllAuto()
                    .then(() => setRestoreMsg(`✓ 已恢复 ${n} 条 AI 自动处置,相关告警已回到待处置`))
                    .catch(() => setRestoreMsg("✕ 恢复失败,请稍后重试"));
                }
              }}
            >
              ⏮ 一键恢复全部自动处置{autoActive > 0 ? `(${autoActive})` : ""}
            </Button>
            {restoreMsg ? (
              <span className={restoreMsg.startsWith("✓") ? "text-[11px] text-emerald-400" : "text-[11px] text-red-400"}>
                {restoreMsg}
              </span>
            ) : (
              autoActive === 0 && (
                <span className="text-[11px] text-muted-foreground">暂无可恢复的 AI 自动处置(仅自动处置模式下产生)</span>
              )
            )}
          </div>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>告警</TableHead>
              <TableHead>处置动作</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispositions.map((d) => (
              <TableRow key={d.id} className={d.revoked ? "opacity-50" : ""}>
                <TableCell className="text-xs text-muted-foreground">{fmtTime(d.timestamp)}</TableCell>
                <TableCell>{d.alertName}</TableCell>
                <TableCell className={`text-sm ${d.revoked ? "text-muted-foreground line-through" : ""}`}>
                  {d.action}
                </TableCell>
                <TableCell>
                  <SourceBadge auto={d.auto} />
                </TableCell>
                <TableCell>{d.operator}</TableCell>
                <TableCell className="text-right">
                  {d.revoked ? (
                    <span className="text-xs text-muted-foreground">已撤销</span>
                  ) : canOperate ? (
                    <Button size="sm" variant="ghost" onClick={() => void revoke(d.id)}>
                      撤销
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">只读</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!dispositions.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  暂无处置记录。在告警中心采纳 AI 建议后,记录将出现在此。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
