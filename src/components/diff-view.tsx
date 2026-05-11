import { scoreDiff, type WordDiff } from "@/lib/word-diff";

type DiffViewProps = {
  title: string;
  diff: WordDiff | null;
};

export function DiffView({ title, diff }: DiffViewProps) {
  if (!diff) {
    return null;
  }

  return (
    <section className="result-box" aria-label={title}>
      <div className="result-header">
        <h3 className="result-title">{title}</h3>
        <span className="result-score">{scoreDiff(diff)}%</span>
      </div>
      <div className="diff-line">
        {diff.operations.map((operation, index) => {
          const text =
            operation.type === "insert"
              ? `+ ${operation.actual}`
              : operation.type === "delete"
                ? `- ${operation.expected}`
                : operation.type === "substitute"
                  ? `${operation.expected} / ${operation.actual}`
                  : operation.expected;

          return (
            <span className={`diff-token ${operation.type}`} key={`${operation.type}-${index}`}>
              {text}
            </span>
          );
        })}
      </div>
    </section>
  );
}

