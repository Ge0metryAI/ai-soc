// 全局 TypeScript 契约 —— 题目 D · AI SOC 安全运营看板

export type Severity = "critical" | "high" | "medium" | "low";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type AlertStatus = "pending" | "adopted" | "false_positive";
export type AlertType =
  | "brute_force"
  | "port_scan"
  | "sql_injection"
  | "malware_callback"
  | "web_scan"
  | "xss"
  | "priv_escalation";

export interface Asset {
  ip: string;
  name: string;
  importance: 1 | 2 | 3; // 3=核心 2=重要 1=一般
  department: string;
}

/** 数据库中存储的原始告警(不含研判派生字段) */
export interface RawAlert {
  id: string;
  name: string;
  alertType: AlertType;
  sourceIp: string;
  destIp: string;
  severity: Severity;
  timestamp: string; // ISO 8601
  status: AlertStatus;
}

/** 置信度研判依据 —— 可解释规则引擎核心,供 UI 透明展示 */
export interface ConfidenceBreakdown {
  base: number; // 告警类型基线
  importanceBonus: number; // 资产重要性加权
  severityBonus: number; // 严重度加权
  learningAdj: number; // 误报学习调整(通常为负)
  final: number; // clamp(0,100) 后
  hitRule: string; // 命中的主规则文字
}

/** 运行时由引擎派生的完整告警(含 AI 研判结果) */
export interface Alert extends RawAlert {
  confidence: number; // 0-100
  priority: Priority;
  aiSuggestion: string | null;
  breakdown: ConfidenceBreakdown;
}

/** 聚合事件:同源IP + 同类型合并 */
export interface AggregatedEvent {
  id: string;
  sourceIp: string;
  alertType: AlertType;
  alertIds: string[];
  count: number;
  firstSeen: string;
  lastSeen: string;
  maxConfidence: number;
  priority: Priority;
  timeline: { time: string; alertName: string }[];
}

/** 误报学习记忆:告警类型 -> 置信度调整量(负值=因误报降低) */
export type LearningMemory = Partial<Record<AlertType, number>>;

export interface DispositionRecord {
  id: string;
  alertId: string;
  alertName: string;
  action: string;
  operator: string;
  timestamp: string;
}

/** 服务端 /api/soc 返回 & localStorage 降级镜像的快照 */
export interface SocSnapshot {
  assets: Asset[];
  alerts: RawAlert[];
  learningMemory: LearningMemory;
  dispositions: DispositionRecord[];
}

export interface AlertFilters {
  severity?: Severity;
  priority?: Priority;
  status?: AlertStatus;
  sortBy: "confidence" | "priority" | "timestamp";
  sortOrder: "asc" | "desc";
}

/** 仪表板关键指标 */
export interface Kpis {
  totalAlerts: number; // 今日告警总数
  eventCount: number; // 聚合后事件数
  avgConfidence: number; // 平均置信度
  pendingHighRisk: number; // 待处置高危(P0/P1)
  denoiseRate: number; // 降噪率 0-1
  falsePositiveRate: number; // 误报率 0-1
  dispositionRate: number; // 处置率 0-1 (已采纳+已标记误报)/总数
}

export type ConnectionMode = "online" | "fallback";
