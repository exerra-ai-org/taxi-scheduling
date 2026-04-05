import { useEffect, useState } from "react";
import { listDrivers } from "../../api/admin";
import { SkeletonCard } from "../../components/Skeleton";
import { IconUser } from "../../components/icons";

interface Driver {
  id: number;
  email: string;
  name: string;
  phone: string;
  upcomingAssignments: number;
}

export default function DriverManagement() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDrivers()
      .then((d) => setDrivers(d.drivers))
      .finally(() => setLoading(false));
  }, []);

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
          <h1 className="page-title mt-4 text-[40px]">Drivers</h1>
        </div>
      </div>

      {drivers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconUser className="h-8 w-8" />
          </div>
          <p className="caption-copy">No drivers registered</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block glass-table">
            <table className="ds-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3 text-right">Upcoming</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-medium text-[var(--color-dark)]">
                      {d.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">
                      <div>{d.email}</div>
                      <div className="mono-label mt-1">{d.phone}</div>
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

          <div className="md:hidden space-y-2">
            {drivers.map((d) => (
              <div key={d.id} className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="body-copy font-medium text-[var(--color-dark)]">
                      {d.name}
                    </div>
                    <div className="caption-copy mt-0.5">{d.email}</div>
                    <div className="mono-label">{d.phone}</div>
                  </div>
                  <div className="text-center">
                    <div className="metric-value text-[32px]">
                      {d.upcomingAssignments}
                    </div>
                    <div className="mono-label">upcoming</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
