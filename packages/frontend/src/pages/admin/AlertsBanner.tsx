import type { Booking } from "shared/types";

interface Props {
  bookings: Booking[];
  onFilterUnassigned: () => void;
  onFilterStartingSoon: () => void;
}

export default function AlertsBanner({
  bookings,
  onFilterUnassigned,
  onFilterStartingSoon,
}: Props) {
  const unassigned = bookings.filter((b) => b.status === "scheduled").length;
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const startingSoon = bookings.filter(
    (b) =>
      (b.status === "scheduled" || b.status === "assigned") &&
      new Date(b.scheduledAt) <= twoHoursFromNow,
  ).length;

  if (!unassigned && !startingSoon) return null;

  return (
    <div className="flex gap-3 mb-4">
      {unassigned > 0 && (
        <button
          onClick={onFilterUnassigned}
          className="alert alert-warning flex-1 text-left"
        >
          <span className="font-semibold">{unassigned}</span> ride
          {unassigned !== 1 ? "s" : ""} unassigned
        </button>
      )}
      {startingSoon > 0 && (
        <button
          onClick={onFilterStartingSoon}
          className="alert alert-error flex-1 text-left"
        >
          <span className="font-semibold">{startingSoon}</span> ride
          {startingSoon !== 1 ? "s" : ""} starting within 2h
        </button>
      )}
    </div>
  );
}
