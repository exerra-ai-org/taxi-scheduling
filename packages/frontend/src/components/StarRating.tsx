interface Props {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}

export default function StarRating({
  value,
  onChange,
  readonly = false,
}: Props) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onChange?.(star)}
          disabled={readonly}
          className={`flex h-10 w-10 items-center justify-center rounded-[4px] border text-2xl transition-colors ${
            readonly ? "cursor-default" : "cursor-pointer"
          } ${
            star <= value
              ? "border-[var(--color-green)] bg-[rgb(152_254_0_/_0.2)] text-[var(--color-dark)]"
              : "border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-border-light)]"
          }`}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
