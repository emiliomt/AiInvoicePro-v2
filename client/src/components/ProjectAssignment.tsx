import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Building2, Target, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";

interface Project {
  id: number;
  projectId: string;
  name: string;
  description: string | null;
  budget: string | null;
  currency: string;
  status: string;
}

interface PurchaseOrder {
  id: number;
  poId: string;
  vendorName: string;
  projectId: string | null;
  amount: string;
  currency: string;
  items: any[];
  status: string;
}

interface InvoiceMatch {
  id: number;
  invoiceId: number;
  poId: number;
  matchScore: string;
  status: "auto" | "manual" | "unresolved";
  matchDetails: any;
  purchaseOrder: PurchaseOrder | null;
}

interface ProjectAssignmentProps {
  invoiceId: number;
  currentProject?: string;
}

export default function ProjectAssignment({ invoiceId, currentProject }: ProjectAssignmentProps) {
  const [selectedProject, setSelectedProject] = useState<string>(currentProject || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch invoice PO matches
  const { data: matches = [] } = useQuery<InvoiceMatch[]>({
    queryKey: ["/api/invoices", invoiceId, "matches"],
  });

  // Assign project mutation
  const assignProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/invoices/${invoiceId}/assign-project`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to assign project");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Project assigned successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update match status mutation
  const updateMatchMutation = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: number; status: string }) => {
      const response = await fetch(`/api/invoice-matches/${matchId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update match");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId, "matches"] });
      toast({
        title: "Success",
        description: "Match status updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAssignProject = () => {
    if (selectedProject) {
      assignProjectMutation.mutate(selectedProject);
    }
  };

  const handleAcceptMatch = (matchId: number) => {
    updateMatchMutation.mutate({ matchId, status: "manual" });
  };

  const handleRejectMatch = (matchId: number) => {
    updateMatchMutation.mutate({ matchId, status: "unresolved" });
  };

  const getMatchStatusBadge = (status: string, score: number) => {
    if (status === "auto") {
      return <Badge className="bg-green-100 text-green-800">Auto Match ({score}%)</Badge>;
    } else if (status === "manual") {
      return <Badge className="bg-blue-100 text-blue-800">Manual Match ({score}%)</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Needs Review ({score}%)</Badge>;
    }
  };

  const getMatchConfidenceColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Project Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="text-blue-600" size={20} />
            <span>Project Assignment</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {currentProject && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="text-blue-600" size={16} />
                  <span className="text-sm font-medium text-blue-800">
                    Currently assigned to: {currentProject}
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex space-x-2">
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.projectId} value={project.projectId}>
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                        <span className="text-xs text-gray-500">{project.projectId}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAssignProject}
                disabled={!selectedProject || assignProjectMutation.isPending}
              >
                Assign
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PO Matching Results */}
      {matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="text-purple-600" size={20} />
              <span>Purchase Order Matches</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {matches.map((match) => (
                <div key={match.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      {match.purchaseOrder ? (
                        <>
                          <h4 className="font-medium">{match.purchaseOrder?.poId}</h4>
                          <p className="text-sm text-gray-600">
                            Vendor: {match.purchaseOrder?.vendorName}
                          </p>
                          <p className="text-sm text-gray-600">
                            Amount: {match.purchaseOrder?.currency} {match.purchaseOrder?.amount}
                          </p>
                          {match.purchaseOrder?.projectId && (
                            <p className="text-sm text-gray-600">
                              Project: {match.purchaseOrder?.projectId}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <h4 className="font-medium text-gray-500">PO Data Unavailable</h4>
                          <p className="text-sm text-gray-400">Purchase order information could not be loaded</p>
                        </>
                      )}
                    </div>
                    <div className="text-right space-y-2">
                      {getMatchStatusBadge(match.status, parseInt(match.matchScore))}
                    </div>
                  </div>

                  {/* Match Confidence Visualization */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Match Confidence</span>
                      <span>{match.matchScore}%</span>
                    </div>
                    <Progress 
                      value={parseInt(match.matchScore)} 
                      className="h-2"
                    />
                  </div>

                  {/* Match Details */}
                  {match.matchDetails && (
                    <div className="text-xs text-gray-600 space-y-1">
                      <div className="flex items-center space-x-4">
                        {match.matchDetails.vendorMatch && (
                          <div className="flex items-center space-x-1">
                            <CheckCircle size={12} className="text-green-500" />
                            <span>Vendor match</span>
                          </div>
                        )}
                        {match.matchDetails.amountMatch && (
                          <div className="flex items-center space-x-1">
                            <CheckCircle size={12} className="text-green-500" />
                            <span>Amount match</span>
                          </div>
                        )}
                        {match.matchDetails.totalItemsMatched > 0 && (
                          <div className="flex items-center space-x-1">
                            <CheckCircle size={12} className="text-green-500" />
                            <span>{match.matchDetails.totalItemsMatched} items matched</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons for Unresolved Matches */}
                  {match.status === "unresolved" && (
                    <div className="flex space-x-2 pt-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleAcceptMatch(match.id)}
                        disabled={updateMatchMutation.isPending}
                      >
                        Accept Match
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleRejectMatch(match.id)}
                        disabled={updateMatchMutation.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Matches Found */}
      {matches.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="text-orange-600" size={20} />
              <span>No Purchase Order Matches</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              No matching purchase orders were found for this invoice. You may need to:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm text-gray-600 space-y-1">
              <li>Verify the vendor name matches existing POs</li>
              <li>Check if the amount is within expected ranges</li>
              <li>Ensure line item descriptions align with PO items</li>
              <li>Create a new purchase order if this is an unplanned expense</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}