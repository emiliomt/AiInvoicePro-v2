import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Building2, 
  Target,
  RefreshCw,
  Eye
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ProjectMatcherProps {
  invoiceId: number;
  onMatchComplete?: () => void;
}

interface ProjectMatchResult {
  project_name: string | null;
  project_id: string | null;
  match_reason: string;
  confidence_score: number;
  flagged: boolean;
}

interface MatchResponse {
  success: boolean;
  match: ProjectMatchResult;
  assigned: boolean;
  message: string;
}

export default function ProjectMatcher({ invoiceId, onMatchComplete }: ProjectMatcherProps) {
  const [isMatching, setIsMatching] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current project match status
  const { data: matchStatus } = useQuery({
    queryKey: [`/api/invoices/${invoiceId}/project-match`],
    enabled: !!invoiceId,
  });

  // Project matching mutation
  const matchProjectMutation = useMutation({
    mutationFn: async () => {
      setIsMatching(true);
      const response = await apiRequest('POST', `/api/invoices/${invoiceId}/match-project`);
      return response.json() as Promise<MatchResponse>;
    },
    onSuccess: (data) => {
      setIsMatching(false);
      
      if (data.success) {
        toast({
          title: "Project Matching Complete",
          description: data.message,
          variant: data.match.flagged ? "destructive" : "default",
        });

        // Invalidate related queries
        queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/project-match`] });
        queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/flags"] });

        onMatchComplete?.();
      }
    },
    onError: (error: any) => {
      setIsMatching(false);
      
      const errorMessage = error.message || "Failed to match project";
      
      // Check if it's an OpenAI API key issue
      if (errorMessage.includes('API key') || errorMessage.includes('openai')) {
        toast({
          title: "AI Service Configuration Required",
          description: "OpenAI API key is required for project matching. Please configure it in settings.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Project Matching Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const handleMatchProject = () => {
    matchProjectMutation.mutate();
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-600 bg-green-50";
    if (score >= 0.65) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getConfidenceIcon = (score: number, flagged: boolean) => {
    if (flagged) return <XCircle className="h-4 w-4 text-red-500" />;
    if (score >= 0.8) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (score >= 0.65) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  return (
    <Card className="bg-white shadow-sm border border-gray-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            AI Project Matching
          </CardTitle>
          <Button
            onClick={handleMatchProject}
            disabled={isMatching || matchProjectMutation.isPending}
            size="sm"
            variant="outline"
          >
            {isMatching ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                {matchStatus?.assignedProject ? 'Re-match' : 'Match Project'}
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isMatching && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <RefreshCw className="h-4 w-4 animate-spin" />
              AI is analyzing invoice data and comparing with available projects...
            </div>
            <Progress value={30} className="w-full" />
          </div>
        )}

        {matchStatus?.assignedProject && (
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>
                  Currently assigned to project: <strong>{matchStatus.assignedProject}</strong>
                </span>
                <Button variant="ghost" size="sm">
                  <Eye className="h-4 w-4 mr-1" />
                  View Details
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {matchStatus?.hasMatchingIssues && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This invoice has project matching issues that require review.
              <div className="mt-2">
                {matchStatus.matchingFlags?.map((flag: any, index: number) => (
                  <div key={index} className="text-sm">
                    • {flag.description}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Show last matching result if available */}
        {matchProjectMutation.data?.match && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium text-gray-900">Last Matching Result</h4>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Confidence Score:</span>
                <div className="flex items-center gap-2">
                  {getConfidenceIcon(
                    matchProjectMutation.data.match.confidence_score,
                    matchProjectMutation.data.match.flagged
                  )}
                  <Badge className={getConfidenceColor(matchProjectMutation.data.match.confidence_score)}>
                    {(matchProjectMutation.data.match.confidence_score * 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>

              {matchProjectMutation.data.match.project_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Matched Project:</span>
                  <span className="text-sm font-medium">
                    {matchProjectMutation.data.match.project_name}
                  </span>
                </div>
              )}

              <div className="text-sm text-gray-600">
                <strong>Reason:</strong> {matchProjectMutation.data.match.match_reason}
              </div>

              {matchProjectMutation.data.match.flagged && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This match has been flagged for manual review due to low confidence or potential issues.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 pt-2 border-t">
          <p>
            AI project matching analyzes invoice data including vendor, project names, addresses, 
            and descriptions to find the best matching project with confidence scoring.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}