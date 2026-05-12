export type DiffOperation =
  | { type: "equal"; expected: string; actual: string }
  | { type: "substitute"; expected: string; actual: string }
  | { type: "delete"; expected: string; actual: null }
  | { type: "insert"; expected: null; actual: string };

export type WordDiff = {
  operations: DiffOperation[];
  expectedWordCount: number;
  actualWordCount: number;
};

type Token = {
  original: string;
  normalized: string;
};

const CONTRACTION_EXPANSIONS: Record<string, string[]> = {
  "i'm": ["i", "am"],
  "you're": ["you", "are"],
  "he's": ["he", "is"],
  "she's": ["she", "is"],
  "it's": ["it", "is"],
  "we're": ["we", "are"],
  "they're": ["they", "are"],
  "i've": ["i", "have"],
  "you've": ["you", "have"],
  "we've": ["we", "have"],
  "they've": ["they", "have"],
  "i'll": ["i", "will"],
  "you'll": ["you", "will"],
  "he'll": ["he", "will"],
  "she'll": ["she", "will"],
  "it'll": ["it", "will"],
  "we'll": ["we", "will"],
  "they'll": ["they", "will"],
  "i'd": ["i", "would"],
  "you'd": ["you", "would"],
  "he'd": ["he", "would"],
  "she'd": ["she", "would"],
  "we'd": ["we", "would"],
  "they'd": ["they", "would"],
  "can't": ["can", "not"],
  "won't": ["will", "not"],
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "isn't": ["is", "not"],
  "aren't": ["are", "not"],
  "wasn't": ["was", "not"],
  "weren't": ["were", "not"],
  "haven't": ["have", "not"],
  "hasn't": ["has", "not"],
  "hadn't": ["had", "not"],
  "wouldn't": ["would", "not"],
  "shouldn't": ["should", "not"],
  "couldn't": ["could", "not"]
};

export function normalizeWords(text: string): string[] {
  return tokenize(text).map((token) => token.normalized);
}

export function buildWordDiff(expected: string, actual: string): WordDiff {
  const expectedTokens = tokenize(expected);
  const actualTokens = tokenize(actual);
  const distances = buildDistanceTable(expectedTokens, actualTokens);
  const operations: DiffOperation[] = [];

  let expectedIndex = 0;
  let actualIndex = 0;

  while (expectedIndex < expectedTokens.length || actualIndex < actualTokens.length) {
    const expectedToken = expectedTokens[expectedIndex];
    const actualToken = actualTokens[actualIndex];

    if (!expectedToken && actualToken) {
      operations.push({ type: "insert", expected: null, actual: actualToken.original });
      actualIndex += 1;
      continue;
    }

    if (expectedToken && !actualToken) {
      operations.push({ type: "delete", expected: expectedToken.original, actual: null });
      expectedIndex += 1;
      continue;
    }

    if (!expectedToken || !actualToken) {
      break;
    }

    if (expectedToken.normalized === actualToken.normalized) {
      operations.push({
        type: "equal",
        expected: expectedToken.original,
        actual: actualToken.original
      });
      expectedIndex += 1;
      actualIndex += 1;
      continue;
    }

    const current = distances[expectedIndex][actualIndex];
    const substitute = distances[expectedIndex + 1][actualIndex + 1] + 1;
    const remove = distances[expectedIndex + 1][actualIndex] + 1;
    const insert = distances[expectedIndex][actualIndex + 1] + 1;

    if (substitute === current) {
      operations.push({
        type: "substitute",
        expected: expectedToken.original,
        actual: actualToken.original
      });
      expectedIndex += 1;
      actualIndex += 1;
    } else if (remove === current) {
      operations.push({ type: "delete", expected: expectedToken.original, actual: null });
      expectedIndex += 1;
    } else if (insert === current) {
      operations.push({ type: "insert", expected: null, actual: actualToken.original });
      actualIndex += 1;
    } else {
      operations.push({
        type: "substitute",
        expected: expectedToken.original,
        actual: actualToken.original
      });
      expectedIndex += 1;
      actualIndex += 1;
    }
  }

  return {
    operations,
    expectedWordCount: expectedTokens.length,
    actualWordCount: actualTokens.length
  };
}

export function scoreDiff(diff: WordDiff): number {
  if (diff.expectedWordCount === 0) {
    return diff.actualWordCount === 0 ? 100 : 0;
  }

  const equalCount = diff.operations.filter((operation) => operation.type === "equal").length;
  return Math.round((equalCount / diff.expectedWordCount) * 100);
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .flatMap((chunk) => chunk.split(/[^\p{L}\p{N}']+/u))
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap(expandToken);
}

function expandToken(original: string): Token[] {
  const normalized = original.toLowerCase();
  const expansion = CONTRACTION_EXPANSIONS[normalized];

  if (!expansion) {
    return [{ original, normalized }];
  }

  return expansion.map((part, index) => ({
    original: formatExpandedOriginal(original, part, index),
    normalized: part
  }));
}

function formatExpandedOriginal(source: string, normalizedPart: string, index: number) {
  if (normalizedPart === "i") {
    return "I";
  }

  if (index === 0 && /^[A-Z]/.test(source)) {
    return normalizedPart.charAt(0).toUpperCase() + normalizedPart.slice(1);
  }

  return normalizedPart;
}

function buildDistanceTable(expected: Token[], actual: Token[]): number[][] {
  const distances = Array.from({ length: expected.length + 1 }, () =>
    Array.from({ length: actual.length + 1 }, () => 0)
  );

  for (let expectedIndex = expected.length; expectedIndex >= 0; expectedIndex -= 1) {
    for (let actualIndex = actual.length; actualIndex >= 0; actualIndex -= 1) {
      if (expectedIndex === expected.length) {
        distances[expectedIndex][actualIndex] = actual.length - actualIndex;
        continue;
      }

      if (actualIndex === actual.length) {
        distances[expectedIndex][actualIndex] = expected.length - expectedIndex;
        continue;
      }

      if (expected[expectedIndex].normalized === actual[actualIndex].normalized) {
        distances[expectedIndex][actualIndex] = distances[expectedIndex + 1][actualIndex + 1];
        continue;
      }

      distances[expectedIndex][actualIndex] =
        1 +
        Math.min(
          distances[expectedIndex + 1][actualIndex + 1],
          distances[expectedIndex + 1][actualIndex],
          distances[expectedIndex][actualIndex + 1]
        );
    }
  }

  return distances;
}
