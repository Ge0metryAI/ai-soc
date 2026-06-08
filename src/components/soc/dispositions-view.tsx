"use client";

import { useSocStore } from "@/store/socStore";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtTime } from "@/components/soc/meta";

export function DispositionsView() {
  const dispositions = useSocStore((s) => s.dispositions);
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>告警</TableHead>
            <TableHead>处置动作</TableHead>
            <TableHead>操作人</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dispositions.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="text-xs text-muted-foreground">{fmtTime(d.timestamp)}</TableCell>
              <TableCell>{d.alertName}</TableCell>
              <TableCell className="text-sm">{d.action}</TableCell>
              <TableCell>{d.operator}</TableCell>
            </TableRow>
          ))}
          {!dispositions.length && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                暂无处置记录。在告警中心采纳 AI 建议后,记录将出现在此。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
