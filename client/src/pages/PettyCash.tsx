import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import PettyCashManager from "@/components/PettyCashManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Clock, CheckCircle, XCircle } from "lucide-react";

export default function PettyCash() {
  const { user } = useAuth();

  // Fetch petty cash stats
  const { data: stats } = useQuery({
    queryKey: ["/api/petty-cash"],
    select: (data: any[]) => {
      const pending = data.filter(log => log.status === "pending_approval").length;
      const approved = data.filter(log => log.status === "approved").length;
      const rejected = data.filter(log => log.status === "rejected").length;
      const totalValue = data.reduce((sum, log) => sum + parseFloat(log.invoice.totalAmount || "0"), 0);
      
      return {
        total: data.length,
        pending,
        approved,
        rejected,
        totalValue: totalValue.toFixed(2),
      };
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Petty Cash Management</h1>
          <p className="text-gray-600 mt-2">
            Manage small invoice approvals and cost center assignments
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Petty Cash</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.total || 0}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-blue-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="text-yellow-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{stats?.approved || 0}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-3xl font-bold text-gray-900">${stats?.totalValue || "0.00"}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-purple-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6">
          <div className="flex space-x-4">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 cursor-pointer px-4 py-2">
              All ({stats?.total || 0})
            </Badge>
            <Badge variant="outline" className="cursor-pointer px-4 py-2 hover:bg-yellow-50">
              Pending ({stats?.pending || 0})
            </Badge>
            <Badge variant="outline" className="cursor-pointer px-4 py-2 hover:bg-green-50">
              Approved ({stats?.approved || 0})
            </Badge>
            <Badge variant="outline" className="cursor-pointer px-4 py-2 hover:bg-red-50">
              Rejected ({stats?.rejected || 0})
            </Badge>
          </div>
        </div>

        {/* Petty Cash Manager Component */}
        <PettyCashManager showAllLogs={true} />
      </div>
    </div>
  );
}