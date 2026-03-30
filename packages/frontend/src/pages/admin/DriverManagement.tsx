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
    <div>
      <h1 className="text-xl font-semibold mb-4">Drivers</h1>

      {drivers.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
            <IconUser className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm">No drivers registered</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Driver
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Contact
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide text-right">
                    Upcoming
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {d.name}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div>{d.email}</div>
                      <div className="text-xs text-gray-400">{d.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-semibold text-sm">
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
              <div key={d.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-gray-900">
                      {d.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {d.email}
                    </div>
                    <div className="text-xs text-gray-400">{d.phone}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-blue-600">
                      {d.upcomingAssignments}
                    </div>
                    <div className="text-xs text-gray-400">upcoming</div>
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
