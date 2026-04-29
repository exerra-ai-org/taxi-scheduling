import { useEffect, useMemo, useState } from "react";
import { listDrivers, assignDrivers } from "../../api/admin";
import type { AdminDriverRow } from "../../api/drivers";
import { ApiError } from "../../api/client";

interface Props {
  bookingId: number;
  onAssigned: () => void;
}

export default function DriverAssignmentForm({ bookingId, onAssigned }: Props) {
  const [drivers, setDrivers] = useState<AdminDriverRow[]>([]);
  const [primaryId, setPrimaryId] = useState<number>(0);
  const [backupId, setBackupId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [driversLoading, setDriversLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setDriversLoading(true);
    listDrivers()
      .then((d) => setDrivers(d.drivers))
      .finally(() => setDriversLoading(false));
  }, []);

  useEffect(() => {
    setPrimaryId(0);
    setBackupId(0);
    setSearch("");
    setError("");
  }, [bookingId]);

  const visibleDrivers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...drivers]
      .filter((driver) => {
        if (!term) return true;
        return [
          driver.name,
          driver.email,
          driver.phone ?? "",
          driver.profile?.licensePlate ?? "",
          driver.profile?.vehicleMake ?? "",
          driver.profile?.vehicleModel ?? "",
          driver.profile?.vehicleClass ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort(
        (a, b) =>
          a.upcomingAssignments - b.upcomingAssignments ||
          (b.avgRating ?? 0) - (a.avgRating ?? 0) ||
          a.name.localeCompare(b.name),
      );
  }, [drivers, search]);

  function selectDriver(driverId: number) {
    setError("");
    if (primaryId === driverId) {
      setPrimaryId(0);
      return;
    }
    if (backupId === driverId) {
      setBackupId(0);
      return;
    }
    if (!primaryId) {
      setPrimaryId(driverId);
      return;
    }
    if (!backupId) {
      setBackupId(driverId);
      return;
    }
    setBackupId(driverId);
  }

  function vehicleSummary(driver: AdminDriverRow) {
    if (!driver.profile) return "No vehicle profile";
    const vehicle = [
      driver.profile.vehicleYear,
      driver.profile.vehicleMake,
      driver.profile.vehicleModel,
    ]
      .filter(Boolean)
      .join(" ");
    return [vehicle || "Vehicle on file", driver.profile.licensePlate]
      .filter(Boolean)
      .join(" · ");
  }

  async function handleAssign() {
    if (!primaryId || !backupId) {
      setError("Select both drivers");
      return;
    }
    if (primaryId === backupId) {
      setError("Primary and backup must be different");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await assignDrivers(bookingId, primaryId, backupId);
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Assignment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-driver-picker">
      <div>
        <h3 className="section-label">Assign drivers</h3>
        <p className="caption-copy mt-1">
          Pick a primary driver first, then a backup. Lowest workload is ranked
          first.
        </p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <label className="admin-driver-search">
        <span className="sr-only">Search drivers</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input-glass"
          placeholder="Search driver, vehicle, plate"
        />
      </label>

      <div className="admin-selected-drivers" aria-live="polite">
        <div className={primaryId ? "is-filled" : ""}>
          <span>Primary</span>
          <strong>
            {drivers.find((driver) => driver.id === primaryId)?.name ||
              "Not selected"}
          </strong>
        </div>
        <div className={backupId ? "is-filled" : ""}>
          <span>Backup</span>
          <strong>
            {drivers.find((driver) => driver.id === backupId)?.name ||
              "Not selected"}
          </strong>
        </div>
      </div>

      {driversLoading ? (
        <div className="caption-copy">Loading drivers...</div>
      ) : visibleDrivers.length === 0 ? (
        <div className="empty-state admin-driver-empty">
          <p className="caption-copy">No drivers match that search.</p>
        </div>
      ) : (
        <div
          className="admin-driver-list"
          role="listbox"
          aria-label="Available drivers"
        >
          {visibleDrivers.map((driver) => {
            const role =
              driver.id === primaryId
                ? "Primary"
                : driver.id === backupId
                  ? "Backup"
                  : "Choose";
            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => selectDriver(driver.id)}
                className={`admin-driver-option ${driver.id === primaryId || driver.id === backupId ? "is-selected" : ""}`}
                aria-selected={
                  driver.id === primaryId || driver.id === backupId
                }
                role="option"
              >
                <span className="admin-driver-avatar" aria-hidden="true">
                  {driver.name.charAt(0).toUpperCase()}
                </span>
                <span className="admin-driver-body">
                  <span className="admin-driver-name">{driver.name}</span>
                  <span className="admin-driver-meta">
                    {vehicleSummary(driver)}
                  </span>
                  <span className="admin-driver-meta">
                    {driver.upcomingAssignments} upcoming
                    {driver.avgRating != null
                      ? ` · ${driver.avgRating} rating (${driver.totalReviews})`
                      : " · no rating"}
                  </span>
                </span>
                <span className="admin-driver-role">{role}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={handleAssign}
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Assigning..." : "Assign drivers"}
      </button>
    </div>
  );
}
