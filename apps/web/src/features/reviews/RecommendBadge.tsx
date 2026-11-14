// "92% would recommend this". Hidden until there is something to say.
export function RecommendBadge({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  return (
    <p className="inline-flex w-fit items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
      <span aria-hidden="true">&#10003;</span>
      {percent}% would recommend this
    </p>
  );
}
