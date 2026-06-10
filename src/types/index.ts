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
  evidence?: string; // 触发该告警的原始信号(日志行/请求载荷/外联记录),供人工复核 AI 研判
}

/** 处置模式:建议模式(默认,全程人工确认)/ 自动处置模式(仅演练·非生产显式开启) */
export type DispositionMode = "advisory" | "auto";

/** 白名单条目:命中则该告警永不被自动处置(核心资产为引擎自动豁免,不入此表) */
export interface WhitelistEntry {
  id: string;
  value: string; // IP 或 CIDR 网段,如 "10.0.1.100" / "10.0.1.0/24"
  kind: "ip" | "cidr";
  note?: string;
  createdAt: string; // ISO 8601
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

/** 攻击链单步:一次攻击行为及其 MITRE ATT&CK 战术定位 */
export interface AttackStep {
  time: string;
  alertName: string;
  alertType: AlertType;
  tacticId: string; // MITRE 技术编号,如 T1190
  tactic: string; // 战术阶段中文名,如 初始访问
  killChainOrder: number; // 杀伤链阶段序号(越小越早)
}

/** 攻击链:按攻击者(源IP)聚合其全部告警,沿 MITRE 杀伤链阶段还原攻击进程 */
export interface AttackChain {
  id: string;
  sourceIp: string;
  alertIds: string[];
  count: number; // 链内告警总数
  stageCount: number; // 跨越的 MITRE 战术阶段数(去重)
  firstSeen: string;
  lastSeen: string;
  maxConfidence: number;
  priority: Priority; // 链内最高优先级
  steps: AttackStep[]; // 已按杀伤链阶段排序
}

/** 聚合事件:告警归并后的单元 —— 同源同类型合并组(count>1),或单条独立告警(count=1) */
export interface SocEvent {
  id: string;
  sourceIp: string;
  alertType: AlertType;
  alertIds: string[];
  count: number; // 1=独立告警, >1=合并组
  merged: boolean; // count>1
  name: string; // 合并组用类型标签,独立用原告警名
  firstSeen: string;
  lastSeen: string;
  maxConfidence: number;
  priority: Priority;
  timeline: { time: string; alertName: string }[];
  inChain: boolean; // 是否隶属某条多阶段攻击链(用于 ⊕ 标记)
}

/** 误报学习记忆:告警类型 -> 置信度调整量(负值=因误报降低) */
export type LearningMemory = Partial<Record<AlertType, number>>;

export interface DispositionRecord {
  id: string;
  alertId: string;
  alertName: string;
  action: string;
  operator: string; // 人工="security"/角色名;自动="AI-自动"
  timestamp: string;
  mode: DispositionMode; // 该处置发生时的模式
  auto: boolean; // 是否 AI 自动执行(true)还是人工采纳(false)
  revoked: boolean; // 是否已撤销/恢复(撤销保留记录用于审计)
}

/** 服务端 /api/soc 返回 & localStorage 降级镜像的快照 */
export interface SocSnapshot {
  assets: Asset[];
  alerts: RawAlert[];
  learningMemory: LearningMemory;
  dispositions: DispositionRecord[];
  dispositionMode: DispositionMode; // 当前全局处置模式
  whitelist: WhitelistEntry[];
}

/** 可点击排序的列键 —— 与告警中心表头一一对应(AI建议/操作列不参与排序) */
export type AlertSortKey =
  | "priority"
  | "name"
  | "alertType"
  | "sourceIp"
  | "severity"
  | "confidence"
  | "status"
  | "timestamp";

export interface AlertFilters {
  severity?: Severity;
  priority?: Priority;
  status?: AlertStatus;
  sortBy: AlertSortKey;
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

/** AI 分析结果来源:真·LLM 生成 or 规则模板兜底(UI 角标透明展示) */
export type AiSource = "ai" | "rule";

/** 攻击链 AI 研判(/api/ai-analyze mode=chain) */
export interface ChainAnalysis {
  source: AiSource;
  narrative: string; // 杀伤链叙事
  intent: string; // 攻击者意图
  nextActions: string[]; // 下一步可能动作预测
  priorityAdvice: string; // 优先处置建议
}

/** 聚合事件 AI 研判(/api/ai-analyze mode=event) */
export interface EventAnalysis {
  source: AiSource;
  rationale: string; // 归并成因
  risk: string; // 风险研判
  needsHuman: boolean; // 是否需人工立即介入
}

/** 全局态势 AI 总结(/api/ai-analyze mode=posture) */
export interface PostureAnalysis {
  source: AiSource;
  summary: string; // 一段话态势总结
  topThreat: string; // 当前最大威胁
  recommendations: string[]; // 优先处置建议
}

export type ConnectionMode = "online" | "fallback";
