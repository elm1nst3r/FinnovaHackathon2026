import { CLASSIFICATIONS, PERSONAL_DATA_CATEGORIES, SANITISABLE_CATEGORIES } from '../core/model.ts';
import type { Classification, DetectionCategory } from '../core/model.ts';

export interface Span {
  start: number;
  end: number;
  category: DetectionCategory;
}

export interface DetectionResult {
  categories: DetectionCategory[];
  spans: Span[];
}

/**
 * Prototype detection: pattern-based, deliberately crude, and biased towards
 * false positives. It runs entirely in the page and its output leaves the device
 * only as a list of category names — never a matched value, never an offset.
 */
const PATTERNS: { category: DetectionCategory; pattern: RegExp }[] = [
  { category: 'IBAN', pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}[ ]?[A-Z0-9]{1,4}\b/g },
  { category: 'EMAIL', pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },
  { category: 'PHONE', pattern: /(?:\+41|0041|\b0)\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/g },
  {
    category: 'CREDENTIAL',
    pattern:
      /\b(?:password|passwort|api[_-]?key|secret|token|pwd)\b\s*[:=]\s*\S+|\bBearer\s+[A-Za-z0-9._-]{16,}|\b(?:sk|ghp|gho|xoxb)-[A-Za-z0-9]{16,}\b/gi,
  },
  {
    category: 'SPECIAL_CATEGORY',
    pattern:
      /\b(?:diagnos\w*|krankheit|erkrankung|patient\w*|therapie|medikament\w*|betreibung|konkurs|strafregister|vorstrafe|gewerkschaft|religionszugeh\w*|sexuelle\s+orientierung)\b/gi,
  },
  {
    // A salutation followed by capitalised words is a weak signal, which is the
    // honest strength of the evidence. Weak signals raise the classification;
    // they never lower it.
    category: 'PERSON_NAME',
    pattern: /\b(?:Herr|Frau|Mr|Mrs|Ms|Dear|Kunde|Kundin)\s+(?:[A-ZÄÖÜ][\wäöüß]+\s?){1,3}/g,
  },
];

export function detect(text: string): DetectionResult {
  const spans: Span[] = [];

  for (const { category, pattern } of PATTERNS) {
    // A fresh regex per call: a shared /g regex carries lastIndex between calls.
    const regex = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(regex)) {
      if (match.index === undefined) continue;
      spans.push({ start: match.index, end: match.index + match[0].length, category });
    }
  }

  // Patterns overlap — an email inside a salutation, for instance. Sanitisation
  // rewrites by offset, so overlapping spans would corrupt the text. Keep the
  // longest match at each position and drop what it covers.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  for (const span of spans) {
    const previous = kept.at(-1);
    if (previous && span.start < previous.end) continue;
    kept.push(span);
  }

  const categories = [...new Set(kept.map((span) => span.category))];
  return { categories, spans: kept };
}

/**
 * The user declares the classification; detection can only raise it. Somebody
 * who labels a prompt INTERNAL and pastes a customer's IBAN into it has not made
 * it internal, they have made a mistake.
 */
export function raiseClassification(
  declared: Classification,
  categories: readonly DetectionCategory[],
): Classification {
  const floor: Classification = categories.includes('SPECIAL_CATEGORY')
    ? 'STRICTLY_CONFIDENTIAL'
    : categories.some((category) => PERSONAL_DATA_CATEGORIES.includes(category))
      ? 'CONFIDENTIAL'
      : 'INTERNAL';

  return CLASSIFICATIONS.indexOf(floor) > CLASSIFICATIONS.indexOf(declared) ? floor : declared;
}

const PLACEHOLDERS: Record<DetectionCategory, string> = {
  PERSON_NAME: '[NAME]',
  EMAIL: '[EMAIL]',
  PHONE: '[PHONE]',
  IBAN: '[IBAN]',
  CREDENTIAL: '[CREDENTIAL]',
  SPECIAL_CATEGORY: '[SENSITIVE]',
};

export interface Replacement {
  category: DetectionCategory;
  placeholder: string;
  count: number;
}

export interface SanitiseResult {
  text: string;
  replacements: Replacement[];
}

/**
 * Replaces only the categories the decision asked for. A category the rules
 * consider not sanitisable — a credential, a special category of personal data —
 * is never quietly redacted: pretending it is fixed is worse than refusing.
 */
export function sanitise(
  text: string,
  detection: DetectionResult,
  categories: readonly DetectionCategory[],
): SanitiseResult {
  const targets = categories.filter((category) => SANITISABLE_CATEGORIES.includes(category));
  const spans = detection.spans
    .filter((span) => targets.includes(span.category))
    .sort((a, b) => b.start - a.start);

  let output = text;
  const counts = new Map<DetectionCategory, number>();

  for (const span of spans) {
    const placeholder = PLACEHOLDERS[span.category];
    output = output.slice(0, span.start) + placeholder + output.slice(span.end);
    counts.set(span.category, (counts.get(span.category) ?? 0) + 1);
  }

  return {
    text: output,
    replacements: [...counts.entries()].map(([category, count]) => ({
      category,
      placeholder: PLACEHOLDERS[category],
      count,
    })),
  };
}
