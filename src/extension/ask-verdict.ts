import type { ToolVerdict } from '../core/engine.ts';
import type { Classification, Decision, DetectionCategory, HostingRegion } from '../core/model.ts';

/**
 * What the "Ask regula.dot" script sends after reading the selection in the
 * page. Like `DecideMessage`, the text itself is not a field: only the host
 * and the category names cross into the service worker.
 */
export interface AskMessage {
  type: 'AIG_ASK';
  host: string;
  classification: Classification;
  detectedCategories: DetectionCategory[];
}

/** One registered tool's answer to "may this go there?". */
export interface AskVerdict {
  toolId: string;
  toolName: string;
  hostingRegion: HostingRegion;
  approved: boolean;
  /** The user asked from this tool's own page. */
  here: boolean;
  decision: Decision;
  reasons: { policyId: string; rationale: string }[];
  suppressedPolicyIds: string[];
  sanitiseCategories: DetectionCategory[];
}

export interface AskReply {
  /** Null when there is no policy set to decide with; `staleness` says why. */
  verdicts: AskVerdict[] | null;
  staleness: string | null;
}

/**
 * Flattens the engine's survey into what the page needs to render, field by
 * field, so nothing the engine happens to carry (the full tool record, the
 * shadow outcomes) rides along into the page by accident.
 */
export function toAskVerdicts(survey: readonly ToolVerdict[], hereToolId: string | null): AskVerdict[] {
  return survey.map(({ tool, result }) => ({
    toolId: tool.id,
    toolName: tool.name,
    hostingRegion: tool.hostingRegion,
    approved: tool.approvalStatus === 'APPROVED',
    here: tool.id === hereToolId,
    decision: result.decision,
    reasons: result.reasons.map((reason) => ({ policyId: reason.policyId, rationale: reason.rationale })),
    suppressedPolicyIds: [...result.suppressedPolicyIds],
    sanitiseCategories: [...result.sanitiseCategories],
  }));
}
