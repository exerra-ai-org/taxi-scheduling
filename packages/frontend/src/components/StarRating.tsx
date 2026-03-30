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
          className={`text-2xl ${readonly ? "cursor-default" : "cursor-pointer"} ${
            star <= value ? "text-yellow-400" : "text-gray-300"
          }`}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
