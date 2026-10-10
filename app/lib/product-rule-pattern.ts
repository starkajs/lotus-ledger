const MAX_REGEX_PATTERN_LENGTH = 200;
const MAX_REGEX_SUBJECT_LENGTH = 2_000;

function isQuantifier(source: string, index: number): boolean {
  const ch = source[index];
  return ch === "+" || ch === "*" || ch === "{";
}

function skipQuantifier(source: string, index: number): number {
  if (source[index] !== "{") return index + 1;
  const end = source.indexOf("}", index + 1);
  return end === -1 ? source.length : end + 1;
}

type GroupState = { repeats: boolean; alternation: boolean };

/** Quantified groups that already repeat, or that contain alternatives. */
function hasNestedRepetition(pattern: string): boolean {
  const source = pattern.replace(/\\./g, "");
  const groups: GroupState[] = [];
  let index = 0;

  while (index < source.length) {
    const ch = source[index];
    if (ch === "[") {
      const end = source.indexOf("]", index + 1);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === "(") {
      groups.push({ repeats: false, alternation: false });
      index += 1;
      continue;
    }
    if (ch === "|" && groups.length > 0) {
      groups[groups.length - 1]!.alternation = true;
      index += 1;
      continue;
    }
    if (ch === ")" && groups.length > 0) {
      const inner = groups.pop()!;
      index += 1;
      if (isQuantifier(source, index)) {
        if (inner.repeats || inner.alternation) return true;
        if (groups.length > 0) groups[groups.length - 1]!.repeats = true;
        index = skipQuantifier(source, index);
      }
      continue;
    }
    if (isQuantifier(source, index)) {
      if (groups.length > 0) groups[groups.length - 1]!.repeats = true;
      index = skipQuantifier(source, index);
      continue;
    }
    index += 1;
  }

  return false;
}

export function productRulePatternError(
  matchType: string,
  pattern: string,
): string | null {
  if (matchType !== "regex" && matchType !== "sku") return null;
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return `Patterns must be ${MAX_REGEX_PATTERN_LENGTH} characters or fewer.`;
  }
  if (hasNestedRepetition(pattern)) {
    return "That pattern is too expensive to run. Use a simpler expression.";
  }
  try {
    new RegExp(pattern);
  } catch {
    return "That pattern is not a valid regular expression.";
  }
  return null;
}

export function testProductRuleRegex(
  pattern: string,
  flags: string,
  text: string,
): boolean {
  if (productRulePatternError("regex", pattern)) return false;
  try {
    return new RegExp(pattern, flags).test(text.slice(0, MAX_REGEX_SUBJECT_LENGTH));
  } catch {
    return false;
  }
}
