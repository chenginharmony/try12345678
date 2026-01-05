import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminLayout from "@/components/AdminLayout";
import TreasuryWalletPanel from "@/components/TreasuryWalletPanel";
import TreasuryAnalyticsDashboard from "@/components/TreasuryAnalyticsDashboard";
import TreasuryChallengesMonitor from "@/components/TreasuryChallengesMonitor";

export default function AdminTreasury() {
  const { isAdmin, isLoading, adminUser } = useAdminAuth();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-white">Access denied. Admin privileges required.</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Treasury Management</h1>
            <p className="text-slate-400">Manage treasury wallet, monitor imbalances, and view analytics</p>
          </div>
        </div>

        {/* Treasury Wallet Panel */}
        <TreasuryWalletPanel adminUser={adminUser!} />

        {/* Active Challenges Imbalance Monitor */}
        <TreasuryChallengesMonitor adminId={adminUser!.id} />

        {/* Treasury Analytics Dashboard */}
        <TreasuryAnalyticsDashboard adminId={adminUser!.id} />
      </div>
    </AdminLayout>
  );
}