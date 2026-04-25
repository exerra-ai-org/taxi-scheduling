interface Props {
  step: number;
  total: number;
  labels?: string[];
}

export default function StepProgress({ step, total, labels }: Props) {
  const activeLabel = labels?.[step - 1];

  return (
    <div
      className="flex flex-col gap-2"
      aria-label={`Step ${step} of ${total}`}
    >
      <div className="flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => {
          const n = i + 1;
          const isComplete = n < step;
          const isActive = n === step;
          return (
            <div
              key={n}
              className={`progress-rail flex-1 ${isComplete || isActive ? "progress-rail-active" : ""}`}
              aria-current={isActive ? "step" : undefined}
            />
          );
        })}
      </div>
      {activeLabel && (
        <div
          key={activeLabel}
          className="mono-label text-[10px] animate-fade-in"
        >
          {activeLabel}
        </div>
      )}
    </div>
  );
}
