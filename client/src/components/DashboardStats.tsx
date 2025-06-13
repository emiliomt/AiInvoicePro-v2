import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Clock, CheckCircle, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardStatsData {
  totalInvoices: number;
  pendingApproval: number;
  processedToday: number;
  totalValue: string;
}

export default function DashboardStats() {
  const { data: stats, isLoading } = useQuery<DashboardStatsData>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-white shadow-sm border border-gray-200 p-6">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-12 w-12 rounded-xl" />
              </div>
              <div className="mt-4 flex items-center space-x-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  const statsData = [
    {
      title: "Total Invoices",
      value: stats?.totalInvoices?.toLocaleString() || "0",
      change: "+12.5%",
      changeType: "positive" as const,
      icon: FileText,
      iconBg: "bg-primary-50",
      iconColor: "text-primary-600",
    },
    {
      title: "Pending Approval",
      value: stats?.pendingApproval?.toString() || "0",
      change: "-5.2%",
      changeType: "negative" as const,
      icon: Clock,
      iconBg: "bg-warning-50",
      iconColor: "text-warning-600",
    },
    {
      title: "Processed Today",
      value: stats?.processedToday?.toString() || "0",
      change: "+8.1%",
      changeType: "positive" as const,
      icon: CheckCircle,
      iconBg: "bg-success-50",
      iconColor: "text-success-600",
    },
    {
      title: "Total Value",
      value: formatCurrency(stats?.totalValue || "0"),
      change: "+15.3%",
      changeType: "positive" as const,
      icon: DollarSign,
      iconBg: "bg-primary-50",
      iconColor: "text-primary-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statsData.map((stat, index) => (
        <Card key={index} className="bg-white shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 ${stat.iconBg} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`${stat.iconColor}`} size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className={`font-medium ${
                stat.changeType === "positive" ? "text-success-600" : "text-warning-600"
              }`}>
                {stat.change}
              </span>
              <span className="text-gray-500 ml-1">from last month</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
