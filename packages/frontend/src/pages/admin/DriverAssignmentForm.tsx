import { useEffect, useState } from "react";
import { listDrivers, assignDrivers } from "../../api/admin";
import { ApiError } from "../../api/client";

interface Driver {
  id: number;
  name: string;
  upcomingAssignments: number;
}

interface Props {
  bookingId: number;
  onAssigned: () => void;
}

export default function DriverAssignmentForm({ bookingId, onAssigned }: Props) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [primaryId, setPrimaryId] = useState<number>(0);
  const [backupId, setBackupId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listDrivers().then((d) => setDrivers(d.drivers));
  }, []);

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
    <div className="space-y-3">
      <h3 className="section-label">Assign Drivers</h3>
      {error && <div className="alert alert-error">{error}</div>}
      <div>
        <label className="field-label mb-2 block">Primary Driver</label>
        <select
          value={primaryId}
          onChange={(e) => setPrimaryId(Number(e.target.value))}
          className="input-glass w-full"
        >
          <option value={0}>Select driver...</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.upcomingAssignments} upcoming)
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label mb-2 block">Backup Driver</label>
        <select
          value={backupId}
          onChange={(e) => setBackupId(Number(e.target.value))}
          className="input-glass w-full"
        >
          <option value={0}>Select driver...</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.upcomingAssignments} upcoming)
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={handleAssign}
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Assigning..." : "Assign Drivers"}
      </button>
    </div>
  );
}
