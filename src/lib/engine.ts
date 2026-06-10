// 可解释规则引擎 —— 所有"AI 研判"均为确定性纯函数,过程对用户透明
import type {
  AggregatedEvent,
  Alert,
  AlertType,
  Asset,
  AttackChain,
  AttackStep,
  ConfidenceBreakdown,
  Kpis,
  LearningMemory,
  Priority,
  RawAlert,
  Severity,
  SocEvent,
  WhitelistEntry,
} from "@/types";

export const LEARNING_DELTA = 15; // 每次误报降低该类型基线分
export const LEARNING_FLOOR = -45; // 学习下限,避免被永久压死在 0
export const LEARNING_CEIL = 0; // 真报回升上限

const BASE_CONFIDENCE: Record<AlertType, number> = {
  malware_callback: 90,
  sql_injection: 85,
  priv_escalation: 82,
  brute_force: 72,
  xss: 60,
  port_scan: 48,
  web_scan: 38,
};

const SEVERITY_BONUS: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 0,
  low: -5,
};

const HIT_RULE: Record<AlertType, string> = {
  brute_force: "同源高频认证失败",
  port_scan: "短时多端口探测",
  sql_injection: "请求参数含 SQL 注入特征",
  malware_callback: "周期性外联可疑 C2 域名",
  web_scan: "高频敏感路径扫描",
  xss: "参数含跨站脚本载荷",
  priv_escalation: "异常提权系统调用序列",
};

const SUGGESTION_TEMPLATES: Record<AlertType, string> = {
  brute_force: "建议临时封禁源IP {sourceIp} 1小时,并强制 {destIp} 重置弱口令",
  port_scan: "建议在边界防火墙封禁 {sourceIp},并加入威胁情报观察名单",
  sql_injection: "建议立即封禁 {sourceIp},核查 {destIp} 的 WAF 规则与注入点",
  malware_callback: "建议隔离主机 {destIp},阻断与 {sourceIp} 的 C2 通信通道",
  priv_escalation: "建议下线 {destIp} 排查提权痕迹,并冻结相关账号",
  web_scan: "建议加强 {destIp} 的访问频率限制,并持续观察 {sourceIp}",
  xss: "建议加强 {destIp} 输入校验与输出编码,拦截 {sourceIp}",
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  brute_force: "暴力破解",
  port_scan: "端口扫描",
  sql_injection: "SQL注入",
  malware_callback: "恶意外联",
  web_scan: "Web扫描",
  xss: "跨站脚本",
  priv_escalation: "提权",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
};

/** MITRE ATT&CK 技术映射 —— 每类告警贴战术/技术编号,提升专业度与可解释性 */
export const MITRE_MAP: Record<AlertType, { id: string; technique: string; tactic: string }> = {
  brute_force: { id: "T1110", technique: "Brute Force", tactic: "凭证访问" },
  port_scan: { id: "T1046", technique: "Network Service Discovery", tactic: "发现" },
  sql_injection: { id: "T1190", technique: "Exploit Public-Facing Application", tactic: "初始访问" },
  malware_callback: { id: "T1071", technique: "Application Layer Protocol (C2)", tactic: "命令与控制" },
  web_scan: { id: "T1595", technique: "Active Scanning", tactic: "侦察" },
  xss: { id: "T1059", technique: "Command and Scripting Interpreter", tactic: "执行" },
  priv_escalation: { id: "T1068", technique: "Exploitation for Privilege Escalation", tactic: "权限提升" },
};

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
export const priorityRank = (p: Priority) => PRIORITY_RANK[p];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function interpolate(tpl: string, a: RawAlert): string {
  return tpl.replace(/\{sourceIp\}/g, a.sourceIp).replace(/\{destIp\}/g, a.destIp);
}

/** 置信度评分 + 研判依据(可解释核心) */
export function computeConfidence(
  alert: RawAlert,
  learning: LearningMemory,
  assetMap: Record<string, Asset>,
): { confidence: number; breakdown: ConfidenceBreakdown } {
  const base = BASE_CONFIDENCE[alert.alertType] ?? 50;
  const asset = assetMap[alert.destIp];
  const importanceBonus = asset ? (asset.importance - 1) * 5 : 0; // 0 / 5 / 10
  const severityBonus = SEVERITY_BONUS[alert.severity];
  const learningAdj = learning[alert.alertType] ?? 0;
  const final = clamp(Math.round(base + importanceBonus + severityBonus + learningAdj), 0, 100);
  return {
    confidence: final,
    breakdown: {
      base,
      importanceBonus,
      severityBonus,
      learningAdj,
      final,
      hitRule: HIT_RULE[alert.alertType],
    },
  };
}

/** 优先级:资产重要性 × 置信度 矩阵 */
export function computePriority(
  alert: RawAlert,
  confidence: number,
  assetMap: Record<string, Asset>,
): Priority {
  const importance = assetMap[alert.destIp]?.importance ?? 1;
  let score = (importance / 3) * 0.5 + (confidence / 100) * 0.5;
  if (alert.severity === "critical") score += 0.15;
  if (score >= 0.8 || (importance === 3 && confidence >= 80)) return "P0";
  if (score >= 0.62) return "P1";
  if (score >= 0.45) return "P2";
  return "P3";
}

/** AI 处置建议:仅对高置信度(>80)+ 高优先级(P0/P1)生成 */
export function generateSuggestion(
  alert: RawAlert,
  confidence: number,
  priority: Priority,
): string | null {
  if (confidence > 80 && (priority === "P0" || priority === "P1")) {
    return interpolate(SUGGESTION_TEMPLATES[alert.alertType] ?? "建议人工研判 {sourceIp} 的行为", alert);
  }
  return null;
}

/** IPv4 是否落入 CIDR 网段(演示级,仅 IPv4) */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!range || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (s: string): number | null => {
    const p = s.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  };
  const a = toInt(ip);
  const b = toInt(range);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/**
 * 白名单豁免判定 —— 命中则该告警绝不被自动处置(防 AI 误伤的安全阀)。
 * 规则①:核心资产(importance=3)自动保护,绝不对自家关键主机做自动动作。
 * 规则②:手动白名单 —— 源/目的 IP 命中精确 IP 或 CIDR 网段。
 * 返回命中原因供 UI 透明展示;未命中 exempt=false。
 */
export function checkExemption(
  alert: Pick<RawAlert, "sourceIp" | "destIp">,
  whitelist: WhitelistEntry[],
  assetMap: Record<string, Asset>,
): { exempt: boolean; reason: string } {
  const destAsset = assetMap[alert.destIp];
  if (destAsset && destAsset.importance === 3) {
    return { exempt: true, reason: `核心资产保护:${destAsset.name}` };
  }
  for (const w of whitelist) {
    for (const [side, ip] of [
      ["源", alert.sourceIp],
      ["目的", alert.destIp],
    ] as const) {
      const hit = w.kind === "cidr" ? ipInCidr(ip, w.value) : ip === w.value;
      if (hit) return { exempt: true, reason: `白名单(${side} ${ip} ∈ ${w.value})` };
    }
  }
  return { exempt: false, reason: "" };
}

/**
 * 危险处置动作类型 —— 即便开启自动模式,这些类型也永远只给建议、绝不自动执行。
 * malware_callback → 隔离主机(影响业务可用性);priv_escalation → 下线主机/冻结账号(影响人与权限)。
 * ⚠ 决策点:此清单与下方阈值由安全团队按风险偏好校准。
 */
export const DANGEROUS_ACTIONS: ReadonlySet<AlertType> = new Set<AlertType>([
  "malware_callback",
  "priv_escalation",
]);

/** 自动处置最低置信度阈值。⚠ 决策点:可按风险偏好调整。 */
export const AUTO_CONFIDENCE_THRESHOLD = 90;

/** 自动处置资格:仅待处置 + P0/P1 + 置信度≥阈值 + 非危险动作类型(危险类型降级为仅建议) */
export function isAutoEligible(
  alert: Pick<Alert, "alertType" | "confidence" | "priority" | "status">,
): boolean {
  if (alert.status !== "pending") return false;
  if (DANGEROUS_ACTIONS.has(alert.alertType)) return false;
  if (alert.priority !== "P0" && alert.priority !== "P1") return false;
  return alert.confidence >= AUTO_CONFIDENCE_THRESHOLD;
}

export function deriveAlert(
  raw: RawAlert,
  learning: LearningMemory,
  assetMap: Record<string, Asset>,
): Alert {
  const { confidence, breakdown } = computeConfidence(raw, learning, assetMap);
  const priority = computePriority(raw, confidence, assetMap);
  const aiSuggestion =
    raw.status === "false_positive" ? null : generateSuggestion(raw, confidence, priority);
  return { ...raw, confidence, priority, aiSuggestion, breakdown };
}

export function deriveAlerts(
  raws: RawAlert[],
  learning: LearningMemory,
  assets: Asset[],
): Alert[] {
  const assetMap = Object.fromEntries(assets.map((a) => [a.ip, a]));
  return raws.map((r) => deriveAlert(r, learning, assetMap));
}

/** 智能聚合:同源IP + 同类型,>=2 条合并为事件(误报不参与) */
export function aggregate(alerts: Alert[]): AggregatedEvent[] {
  const active = alerts.filter((a) => a.status !== "false_positive");
  const groups = new Map<string, Alert[]>();
  for (const a of active) {
    const key = `${a.sourceIp}::${a.alertType}`;
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  const events: AggregatedEvent[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((x, y) => x.timestamp.localeCompare(y.timestamp));
    events.push({
      id: `evt-${key.replace(/[^a-zA-Z0-9]/g, "-")}`,
      sourceIp: group[0].sourceIp,
      alertType: group[0].alertType,
      alertIds: group.map((g) => g.id),
      count: group.length,
      firstSeen: sorted[0].timestamp,
      lastSeen: sorted[sorted.length - 1].timestamp,
      maxConfidence: Math.max(...group.map((g) => g.confidence)),
      priority: [...group].map((g) => g.priority).sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])[0],
      timeline: sorted.map((g) => ({ time: g.timestamp, alertName: g.name })),
    });
  }
  return events.sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.count - a.count,
  );
}

/**
 * MITRE ATT&CK 杀伤链阶段顺序 —— 决定攻击链 steps 的叙事排序(数值越小越早)。
 * 依据 MITRE Enterprise 战术链:侦察→初始访问→执行→权限提升→凭证访问→发现→命令与控制。
 * ⚠ 此排序是攻击链"故事线"的灵魂,直接决定时间线呈现顺序,可按演示侧重调整。
 */
const KILL_CHAIN_ORDER: Record<string, number> = {
  侦察: 1,
  初始访问: 2,
  执行: 3,
  权限提升: 4,
  凭证访问: 5,
  发现: 6,
  命令与控制: 7,
};

/**
 * 攻击链聚合:按攻击者(源IP)聚合其全部告警,沿 MITRE 杀伤链阶段还原攻击进程。
 * 与 aggregate(同源+同类型降噪)互补 —— 此处跨类型,回答"同一攻击者推进到了哪些阶段"。
 * >=2 条告警才成链(误报不计);单条告警留在原始/告警视图。
 */
export function aggregateAttackChains(alerts: Alert[]): AttackChain[] {
  const active = alerts.filter((a) => a.status !== "false_positive");
  const byAttacker = new Map<string, Alert[]>();
  for (const a of active) {
    const arr = byAttacker.get(a.sourceIp) ?? [];
    arr.push(a);
    byAttacker.set(a.sourceIp, arr);
  }
  const chains: AttackChain[] = [];
  for (const [sourceIp, group] of byAttacker) {
    if (group.length < 2) continue;
    const steps: AttackStep[] = group
      .map((a) => {
        const m = MITRE_MAP[a.alertType];
        return {
          time: a.timestamp,
          alertName: a.name,
          alertType: a.alertType,
          tacticId: m.id,
          tactic: m.tactic,
          killChainOrder: KILL_CHAIN_ORDER[m.tactic] ?? 99,
        };
      })
      .sort((x, y) => x.killChainOrder - y.killChainOrder || x.time.localeCompare(y.time));
    const byTime = [...group].sort((x, y) => x.timestamp.localeCompare(y.timestamp));
    const stageCount = new Set(steps.map((s) => s.tactic)).size;
    chains.push({
      id: `chain-${sourceIp.replace(/[^a-zA-Z0-9]/g, "-")}`,
      sourceIp,
      alertIds: group.map((g) => g.id),
      count: group.length,
      stageCount,
      firstSeen: byTime[0].timestamp,
      lastSeen: byTime[byTime.length - 1].timestamp,
      maxConfidence: Math.max(...group.map((g) => g.confidence)),
      priority: [...group]
        .map((g) => g.priority)
        .sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])[0],
      steps,
    });
  }
  // 多阶段杀伤链优先呈现,其次按优先级、再按告警数
  return chains.sort(
    (a, b) =>
      b.stageCount - a.stageCount ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.count - a.count,
  );
}

/**
 * 聚合事件:把原始告警按「同源IP + 同类型」归并 —— >=2 条合并为 1 个事件,其余独立各为 1 个。
 * 这是"降噪"的核心呈现:N 条原始告警 → M 个事件(M<N)。隶属多阶段攻击链的事件标记 inChain。
 */
export function aggregateEvents(alerts: Alert[]): SocEvent[] {
  const active = alerts.filter((a) => a.status !== "false_positive");
  const groups = new Map<string, Alert[]>();
  for (const a of active) {
    const key = `${a.sourceIp}::${a.alertType}`;
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  // 多阶段攻击链的源IP集合(用于 inChain 标记)
  const multiStageIps = new Set(
    aggregateAttackChains(active)
      .filter((c) => c.stageCount >= 2)
      .map((c) => c.sourceIp),
  );
  const events: SocEvent[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((x, y) => x.timestamp.localeCompare(y.timestamp));
    const merged = group.length >= 2;
    events.push({
      id: `evt-${key.replace(/[^a-zA-Z0-9]/g, "-")}`,
      sourceIp: group[0].sourceIp,
      alertType: group[0].alertType,
      alertIds: group.map((g) => g.id),
      count: group.length,
      merged,
      name: merged ? ALERT_TYPE_LABEL[group[0].alertType] : group[0].name,
      firstSeen: sorted[0].timestamp,
      lastSeen: sorted[sorted.length - 1].timestamp,
      maxConfidence: Math.max(...group.map((g) => g.confidence)),
      priority: [...group]
        .map((g) => g.priority)
        .sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])[0],
      timeline: sorted.map((g) => ({ time: g.timestamp, alertName: g.name })),
      inChain: multiStageIps.has(group[0].sourceIp),
    });
  }
  // 合并组优先呈现,再按优先级、告警数、置信度
  return events.sort(
    (a, b) =>
      Number(b.merged) - Number(a.merged) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.count - a.count ||
      b.maxConfidence - a.maxConfidence,
  );
}

/** 误报标记 -> 降低同类型基线(下限保护) */
export function applyFalsePositiveMemory(learning: LearningMemory, type: AlertType): LearningMemory {
  const prev = learning[type] ?? 0;
  return { ...learning, [type]: Math.max(prev - LEARNING_DELTA, LEARNING_FLOOR) };
}

/** 真报回升(双向学习,上限 0) */
export function applyTruePositiveMemory(learning: LearningMemory, type: AlertType): LearningMemory {
  const prev = learning[type] ?? 0;
  return { ...learning, [type]: Math.min(prev + LEARNING_DELTA, LEARNING_CEIL) };
}

/** 仪表板关键指标 */
export function computeKpis(alerts: Alert[], events: AggregatedEvent[]): Kpis {
  const active = alerts.filter((a) => a.status !== "false_positive");
  const totalAlerts = alerts.length;
  // 聚合后事件总数 = 合并事件数 + 未被合并的独立告警数
  const mergedIds = new Set(events.flatMap((e) => e.alertIds));
  const singletons = active.filter((a) => !mergedIds.has(a.id)).length;
  const eventCount = events.length + singletons;
  const avgConfidence = active.length
    ? Math.round(active.reduce((s, a) => s + a.confidence, 0) / active.length)
    : 0;
  const pendingHighRisk = alerts.filter(
    (a) => a.status === "pending" && (a.priority === "P0" || a.priority === "P1"),
  ).length;
  const denoiseRate = active.length > 0 ? Math.max(0, 1 - eventCount / active.length) : 0;
  const fpCount = alerts.filter((a) => a.status === "false_positive").length;
  const adoptedCount = alerts.filter((a) => a.status === "adopted").length;
  const falsePositiveRate = totalAlerts > 0 ? fpCount / totalAlerts : 0;
  const dispositionRate = totalAlerts > 0 ? (fpCount + adoptedCount) / totalAlerts : 0;
  return {
    totalAlerts,
    eventCount,
    avgConfidence,
    pendingHighRisk,
    denoiseRate,
    falsePositiveRate,
    dispositionRate,
  };
}
