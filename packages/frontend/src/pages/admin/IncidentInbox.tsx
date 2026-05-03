import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listIncidents,
  resolveIncident,
  type AdminIncident,
} from "../../api/incidents";
import {
  useRealtimeEvent,
  useRealtimeRecovery,
} from "../../context/RealtimeContext";
import { useToast } from "../../context/ToastContext";
import { SkeletonCard } from "../../components/Skeleton";
import { IconRefresh } from "../../components/icons";
import { formatDate } from "../../lib/format";

type Filter = "open" | "all";

export default function IncidentInbox() {
  const [items, setItems] = useState<AdminIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await listIncidents();
      setItems(data.incidents);
    } catch {
      // toast handled at higher level
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent("incident_reported", load);
  useRealtimeRecovery(load);

  async function handleResolve(id: number) {
    try {
      await resolveIncident(id);
      toast.success("Incident resolved");
      load();
    } catch {
      toast.error("Could not resolve");
    }
  }

  const visible = items.filter((i) => (filter === "open" ? !i.resolved : true));
  const openCount = items.filter((i) => !i.resolved).length;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Admin</p>
          <h1 className="page-title">Incidents</h1>
          <p className="page-subtitle">
            Customer SOS and contact-admin reports. New incidents appear live.
          </p>
        </div>
        <button onClick={load} className="page-header-btn">
          <IconRefresh className="h-4 w-4" />
          <span className="page-header-btn-label">Refresh</span>
        </button>
      </div>

      <div className="segmented-filter" aria-label="Incident filters">
        <button
          onClick={() => setFilter("open")}
          className={filter === "open" ? "is-active" : ""}
        >
          Open
          <span className="admin-filter-count">{openCount}</span>
        </button>
        <button
          onClick={() => setFilter("all")}
          className={filter === "all" ? "is-active" : ""}
        >
          All
          <span className="admin-filter-count">{items.length}</span>
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <p className="caption-copy">
            {filter === "open"
              ? "No open incidents."
              : "No incidents reported yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((i) => {
            const isEmergency = i.type === "emergency";
            return (
              <div
                key={i.id}
                className={`glass-card p-4 border-l-4 ${
                  isEmergency
                    ? "border-l-[var(--color-error)]"
                    : "border-l-[var(--color-orange)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`status-pill ${
                          isEmergency ? "status-error" : "status-warning"
                        }`}
                      >
                        {isEmergency ? "SOS" : "Contact admin"}
                      </span>
                      <span className="mono-label">Booking #{i.bookingId}</span>
                      {i.resolved && (
                        <span className="status-pill status-completed">
                          Resolved
                        </span>
                      )}
                    </div>
                    <div className="body-copy mt-1.5">
                      <strong>{i.reporterName}</strong>
                      {i.reporterPhone && (
                        <>
                          {" · "}
                          <a
                            href={`tel:${i.reporterPhone}`}
                            className="underline"
                          >
                            {i.reporterPhone}
                          </a>
                        </>
                      )}
                    </div>
                    {i.message && (
                      <p className="caption-copy mt-1.5 italic text-[var(--color-mid)]">
                        “{i.message}”
                      </p>
                    )}
                    <div className="mono-label mt-1.5">
                      {formatDate(i.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link
                      to={`/admin?booking=${i.bookingId}`}
                      className="btn-secondary button-text-compact"
                    >
                      Open ride
                    </Link>
                    {!i.resolved && (
                      <button
                        onClick={() => handleResolve(i.id)}
                        className="btn-green button-text-compact"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
