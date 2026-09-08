import { useQuery } from "@tanstack/react-query";
import { platformApi } from "@/modules/platform/platform.api";
import { StatusBadge } from "@/components/ui";

/** Platform users — operators who have a PlatformMembership. */
export function PlatformUsersPage() {
  const { data: users = [], isPending } = useQuery({
    queryKey: ["platform", "users"],
    queryFn: platformApi.users,
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">
        Platform Users
      </h1>

      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500">No platform users found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Roles</th>
                <th className="px-4 py-3 text-left">Membership</th>
                <th className="px-4 py-3 text-left">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.membershipStatus} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
