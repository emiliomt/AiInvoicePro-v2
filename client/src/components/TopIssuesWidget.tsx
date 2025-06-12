import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface IssueData {
  issueType: string;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  trend: string;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "critical":
      return "destructive";
    case "high":
      return "destructive";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "outline";
  }
};

const getTrendIcon = (trend: string) => {
  if (trend.startsWith("+")) {
    return <TrendingUp className="h-3 w-3 text-red-500" />;
  } else if (trend.startsWith("-")) {
    return <TrendingDown className="h-3 w-3 text-green-500" />;
  }
  return <Minus className="h-3 w-3 text-gray-500" />;
};

const getTrendColor = (trend: string) => {
  if (trend.startsWith("+")) {
    return "text-red-600";
  } else if (trend.startsWith("-")) {
    return "text-green-600";
  }
  return "text-gray-600";
};

export default function TopIssuesWidget() {
  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["/api/dashboard/top-issues"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Issues This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topIssues = (issues as IssueData[]).slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <span>Top Issues This Month</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topIssues.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No issues detected this month</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topIssues.map((issue, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-xs font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{issue.issueType}</div>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant={getSeverityColor(issue.severity) as any} className="text-xs">
                        {issue.severity}
                      </Badge>
                      <span className="text-xs text-gray-500">{issue.count} occurrences</span>
                    </div>
                  </div>
                </div>
                <div className={`flex items-center space-x-1 text-xs ${getTrendColor(issue.trend)}`}>
                  {getTrendIcon(issue.trend)}
                  <span>{issue.trend}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}