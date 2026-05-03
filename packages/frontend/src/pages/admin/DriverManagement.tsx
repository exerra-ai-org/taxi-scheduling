import { useCallback, useEffect, useState } from "react";
import {
  listDrivers,
  inviteDriver,
  type AdminDriverRow,
} from "../../api/drivers";
import { SkeletonCard } from "../../components/Skeleton";
import {
  IconUser,
  IconStar,
  IconCar,
  IconPlus,
  IconX,
} from "../../components/icons";
import { ApiError } from "../../api/client";
import {
  useRealtimeEvent,
  useRealtimeRecovery,
} from "../../context/RealtimeContext";

export default function DriverManagement() {
  const [drivers, setDrivers] = useState<AdminDriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"driver" | "admin">("driver");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteDone, setInviteDone] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    listDrivers()
      .then((d) => setDrivers(d.drivers))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh upcomingAssignments counts when an assignment lands or a ride
  // moves to/from completed.
  useRealtimeEvent("drivers_assigned", load);
  useRealtimeEvent("booking_updated", load);
  useRealtimeEvent("booking_cancelled", load);
  // Driver vehicle, name, phone, or rating changed.
  useRealtimeEvent("driver_profile_updated", load);
  useRealtimeEvent("user_updated", load);
  useRealtimeRecovery(load);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteDone("");
    setInviteBusy(true);
    try {
      await inviteDriver(inviteEmail, inviteName, inviteRole);
      setInviteDone(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
      if (inviteRole === "driver") load();
    } catch (err) {
      setInviteError(
        err instanceof ApiError ? err.message : "Could not send invitation",
      );
    } finally {
      setInviteBusy(false);
    }
  }

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
          <h1 className="page-title">Drivers</h1>
        </div>
        <button
          className="page-header-btn page-header-btn-primary"
          onClick={() => {
            setShowInvite((v) => !v);
            setInviteDone("");
            setInviteError("");
          }}
        >
          {showInvite ? (
            <IconX className="h-4 w-4" />
          ) : (
            <IconPlus className="h-4 w-4" />
          )}
          <span className="page-header-btn-label">
            {showInvite ? "Cancel" : "Invite driver"}
          </span>
        </button>
      </div>

      {showInvite && (
        <div className="glass-card p-5 space-y-4">
          <p className="section-label">/ Invite</p>
          {inviteDone && (
            <div className="alert alert-success">{inviteDone}</div>
          )}
          {inviteError && (
            <div className="alert alert-error">{inviteError}</div>
          )}
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
                placeholder="Full name"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="email@example.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                className="form-input"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "driver" | "admin")
                }
              >
                <option value="driver">Driver</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={inviteBusy}
            >
              {inviteBusy ? "Sending…" : "Send invitation"}
            </button>
          </form>
        </div>
      )}

      {drivers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconUser className="h-8 w-8" />
          </div>
          <p className="caption-copy">No drivers registered</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-table">
            <table className="ds-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3 text-right">Upcoming</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--color-dark)]">
                        {d.name}
                      </div>
                      <div className="caption-copy">{d.email}</div>
                      {d.phone && (
                        <div className="mono-label mt-0.5">{d.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">
                      {d.profile ? (
                        <div>
                          <div>
                            {[
                              d.profile.vehicleYear,
                              d.profile.vehicleMake,
                              d.profile.vehicleModel,
                            ]
                              .filter(Boolean)
                              .join(" ") || (
                              <span className="caption-copy">—</span>
                            )}
                          </div>
                          {d.profile.licensePlate && (
                            <div className="mono-label mt-0.5">
                              {d.profile.licensePlate}
                            </div>
                          )}
                          {d.profile.vehicleClass && (
                            <div className="mono-label capitalize">
                              {d.profile.vehicleClass}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="caption-copy">No vehicle</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {d.avgRating != null ? (
                        <div className="flex items-center gap-1">
                          <IconStar className="h-3.5 w-3.5 text-yellow-400" />
                          <span className="font-medium">{d.avgRating}</span>
                          <span className="caption-copy">
                            ({d.totalReviews})
                          </span>
                        </div>
                      ) : (
                        <span className="caption-copy">No ratings</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="number-chip">
                        {d.upcomingAssignments}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {drivers.map((d) => (
              <div key={d.id} className="glass-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="body-copy font-medium text-[var(--color-dark)]">
                      {d.name}
                    </div>
                    <div className="caption-copy mt-0.5">{d.email}</div>
                    {d.phone && <div className="mono-label">{d.phone}</div>}
                  </div>
                  <div className="text-center">
                    <div className="metric-value text-[32px]">
                      {d.upcomingAssignments}
                    </div>
                    <div className="mono-label">upcoming</div>
                  </div>
                </div>

                {d.profile && (
                  <div className="flex items-center gap-2 caption-copy text-[var(--color-mid)]">
                    <IconCar className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {[
                        d.profile.vehicleYear,
                        d.profile.vehicleMake,
                        d.profile.vehicleModel,
                      ]
                        .filter(Boolean)
                        .join(" ") || "Vehicle on file"}
                      {d.profile.licensePlate
                        ? ` · ${d.profile.licensePlate}`
                        : ""}
                    </span>
                  </div>
                )}

                {d.avgRating != null && (
                  <div className="flex items-center gap-1 caption-copy">
                    <IconStar className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="font-medium">{d.avgRating}</span>
                    <span className="text-[var(--color-mid)]">
                      ({d.totalReviews} reviews)
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
