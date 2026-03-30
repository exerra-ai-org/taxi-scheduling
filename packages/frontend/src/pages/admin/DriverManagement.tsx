import { useEffect, useState } from "react";
import { listDrivers } from "../../api/admin";
import { SkeletonCard } from "../../components/Skeleton";

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
    <div>
      <h1 className="text-xl font-semibold mb-4">Drivers</h1>
      <div className="space-y-2">
        {drivers.map((d) => (
          <div key={d.id} className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{d.name}</div>
                <div className="text-xs text-gray-500">
                  {d.email} · {d.phone}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-blue-700">
                  {d.upcomingAssignments}
                </div>
                <div className="text-xs text-gray-400">upcoming</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
