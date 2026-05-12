import type { DiffOperation } from "@/lib/word-diff";

export function getDiffTokenText(operation: DiffOperation) {
  if (operation.type === "insert") {
    return operation.actual;
  }

  return operation.expected;
}
