import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, XCircle, Info, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InvoiceFlag {
  id: number;
  invoiceId: number;
  flagType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details: any;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

interface PredictiveAlert {
  id: number;
  invoiceId: number;
  prediction: string;
  confidence: string;
  alertType: string;
  details: any;
  isActioned: boolean;
  createdAt: string;
}

interface DiscrepancyDisplayProps {
  invoiceId: number;
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case "critical":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "high":
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case "medium":
      return <Info className="h-4 w-4 text-yellow-500" />;
    case "low":
      return <CheckCircle className="h-4 w-4 text-blue-500" />;
    default:
      return <Info className="h-4 w-4 text-gray-500" />;
  }
};

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

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return "bg-red-100 text-red-800 border-red-200";
  if (confidence >= 0.6) return "bg-orange-100 text-orange-800 border-orange-200";
  if (confidence >= 0.4) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
};

export default function DiscrepancyDisplay({ invoiceId }: DiscrepancyDisplayProps) {
  const [showDetails, setShowDetails] = useState<{[key: number]: boolean}>({});
  const { toast } = useToast();

  const { data: flags = [], isLoading: flagsLoading } = useQuery<InvoiceFlag[]>({
    queryKey: ["/api/flags", invoiceId],
    enabled: !!invoiceId,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery<PredictiveAlert[]>({
    queryKey: ["/api/predictive-alerts", invoiceId],
    enabled: !!invoiceId,
  });

  const resolveFlagMutation = useMutation({
    mutationFn: async (flagId: number) => {
      return await apiRequest(`/api/flags/${flagId}/resolve`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flags", invoiceId] });
      toast({
        title: "Flag Resolved",
        description: "The discrepancy has been marked as resolved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to resolve flag: " + error.message,
        variant: "destructive",
      });
    },
  });

  const toggleDetails = (id: number) => {
    setShowDetails(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (flagsLoading || alertsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse" />
        <div className="h-24 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  const unresolvedFlags = flags.filter(flag => !flag.isResolved);
  const hasIssues = unresolvedFlags.length > 0 || alerts.length > 0;

  if (!hasIssues) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">No issues detected</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Discrepancy Flags */}
      {unresolvedFlags.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span>Discrepancies Detected ({unresolvedFlags.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {unresolvedFlags.map((flag: InvoiceFlag) => (
              <div key={flag.id} className="p-3 border rounded-lg bg-white">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {getSeverityIcon(flag.severity)}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-sm">{flag.message}</span>
                        <Badge variant={getSeverityColor(flag.severity) as any} className="text-xs">
                          {flag.severity}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDetails(flag.id)}
                          className="h-6 text-xs"
                        >
                          {showDetails[flag.id] ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showDetails[flag.id] ? "Hide" : "Show"} Details
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => resolveFlagMutation.mutate(flag.id)}
                          disabled={resolveFlagMutation.isPending}
                          className="h-6 text-xs"
                        >
                          Resolve
                        </Button>
                      </div>
                      {showDetails[flag.id] && flag.details && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                          <pre className="whitespace-pre-wrap text-gray-600">
                            {JSON.stringify(flag.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Predictive Issues */}
      {alerts.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center space-x-2">
              <Info className="h-5 w-5 text-blue-500" />
              <span>Predicted Issues ({alerts.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert: PredictiveAlert) => {
              const confidence = parseFloat(alert.confidence);
              return (
                <div key={alert.id} className="p-3 border rounded-lg bg-white">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-medium text-sm">{alert.prediction}</span>
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${getConfidenceColor(confidence)}`}
                        >
                          {Math.round(confidence * 100)}% confidence
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {alert.alertType.replace('_', ' ')}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDetails(alert.id)}
                          className="h-6 text-xs"
                        >
                          {showDetails[alert.id] ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          {showDetails[alert.id] ? "Hide" : "Show"} Details
                        </Button>
                      </div>
                      {showDetails[alert.id] && alert.details && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                          <pre className="whitespace-pre-wrap text-gray-600">
                            {JSON.stringify(alert.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}