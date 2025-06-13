import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Target, CheckCircle, XCircle, Clock, Edit, AlertCircle, Zap } from "lucide-react";

interface ProjectMatch {
  id: number;
  invoiceId: number;
  projectId: string | null;
  confidence: number | null;
  matchedBy: string | null;
  matchStatus: "pending" | "matched" | "rejected" | "auto_matched";
  matchNotes: string | null;
  matchedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invoice: {
    id: number;
    vendorName: string | null;
    invoiceNumber: string | null;
    totalAmount: string | null;
    fileName: string;
    createdAt: string;
  };
  project?: {
    id: number;
    projectId: string;
    name: string;
    description?: string;
    address?: string;
    city?: string;
  };
}

interface ProjectMatchingManagerProps {
  invoiceId?: number;
  showAllMatches?: boolean;
  filterStatus?: string;
  filterAssigned?: boolean;
}

export default function ProjectMatchingManager({ 
  invoiceId, 
  showAllMatches = false, 
  filterStatus, 
  filterAssigned 
}: ProjectMatchingManagerProps) {
  const [editingMatch, setEditingMatch] = useState<ProjectMatch | null>(null);
  const [formData, setFormData] = useState({
    projectId: "",
    matchNotes: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get project matches
  const { data: projectMatches, isLoading } = useQuery<ProjectMatch[]>({
    queryKey: showAllMatches ? ['/api/project-matches'] : [`/api/invoices/${invoiceId}/project-match`],
    enabled: showAllMatches || !!invoiceId,
  });

  // Get available projects
  const { data: projects } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  // Update project match mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest(`/api/project-matches/${id}`, 'PUT', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-matches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setEditingMatch(null);
      setFormData({ projectId: "", matchNotes: "" });
      toast({
        title: "Success",
        description: "Project match updated successfully",
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

  const handleEdit = (match: ProjectMatch) => {
    setEditingMatch(match);
    setFormData({
      projectId: match.projectId || "",
      matchNotes: match.matchNotes || "",
    });
  };

  const handleMatch = (match: ProjectMatch) => {
    updateMutation.mutate({
      id: match.id,
      updates: {
        matchStatus: "matched",
        matchedAt: new Date().toISOString(),
        matchNotes: formData.matchNotes || "",
        matchedBy: "manual",
      },
    });
  };

  const handleReject = (match: ProjectMatch) => {
    updateMutation.mutate({
      id: match.id,
      updates: {
        matchStatus: "rejected",
        matchNotes: formData.matchNotes || "",
        matchedBy: "manual",
      },
    });
  };

  const handleUpdateAssignment = () => {
    if (!editingMatch) return;

    updateMutation.mutate({
      id: editingMatch.id,
      updates: {
        projectId: formData.projectId,
        matchNotes: formData.matchNotes,
      },
    });
  };

  const getStatusBadge = (status: string, confidence?: number | null) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock size={14} className="mr-1" />Pending</Badge>;
      case "matched":
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle size={14} className="mr-1" />Matched</Badge>;
      case "auto_matched":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Zap size={14} className="mr-1" />Auto-Matched ({confidence}%)</Badge>;
      case "rejected":
        return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle size={14} className="mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div>Loading project matching information...</div>;
  }

  // Single invoice view
  if (!showAllMatches && invoiceId) {
    const projectMatch = projectMatches?.[0] as ProjectMatch;

    if (!projectMatch) {
      return null; // No project match record
    }

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="text-blue-600" size={20} />
            <span>Project Assignment</span>
            {getStatusBadge(projectMatch.matchStatus, projectMatch.confidence)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="projectId">Project</Label>
              <Select
                value={editingMatch?.id === projectMatch.id ? formData.projectId : projectMatch.projectId || ""}
                onValueChange={(value) => setFormData(prev => ({ ...prev, projectId: value }))}
                disabled={editingMatch?.id !== projectMatch.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((project) => (
                    <SelectItem key={project.projectId} value={project.projectId}>
                      {project.name} ({project.projectId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Confidence</Label>
              <div className="text-sm text-gray-600 mt-2">
                {projectMatch.confidence ? `${projectMatch.confidence}%` : "Not calculated"}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="matchNotes">Notes</Label>
            <Textarea
              id="matchNotes"
              value={editingMatch?.id === projectMatch.id ? formData.matchNotes : projectMatch.matchNotes || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, matchNotes: e.target.value }))}
              placeholder="Add notes about the project assignment..."
              disabled={editingMatch?.id !== projectMatch.id}
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Status: {projectMatch.matchStatus}
              {projectMatch.matchedAt && (
                <span className="ml-2">
                  • Matched on {new Date(projectMatch.matchedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              {editingMatch?.id === projectMatch.id ? (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setEditingMatch(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleUpdateAssignment}
                    disabled={updateMutation.isPending}
                  >
                    Save Changes
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEdit(projectMatch)}
                  >
                    <Edit size={16} className="mr-2" />
                    Edit
                  </Button>
                  {projectMatch.matchStatus === "pending" && (
                    <>
                      <Button 
                        size="sm"
                        onClick={() => handleMatch(projectMatch)}
                        disabled={updateMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle size={16} className="mr-2" />
                        Approve Match
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleReject(projectMatch)}
                        disabled={updateMutation.isPending}
                        className="text-red-600 hover:text-red-700"
                      >
                        <XCircle size={16} className="mr-2" />
                        Reject
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // All matches view
  const filteredMatches = projectMatches?.filter((match) => {
    if (filterStatus && match.matchStatus !== filterStatus) return false;
    if (filterAssigned !== undefined) {
      const isAssigned = match.projectId !== null;
      if (filterAssigned !== isAssigned) return false;
    }
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="text-blue-600" size={20} />
            <span>Project Matching Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMatches.map((match) => (
                <TableRow key={match.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">#{match.invoice.invoiceNumber || "N/A"}</div>
                      <div className="text-sm text-gray-500">{match.invoice.fileName}</div>
                    </div>
                  </TableCell>
                  <TableCell>{match.invoice.vendorName || "N/A"}</TableCell>
                  <TableCell>${match.invoice.totalAmount || "0.00"}</TableCell>
                  <TableCell>
                    {editingMatch?.id === match.id ? (
                      <Select
                        value={formData.projectId}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, projectId: value }))}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects?.map((project) => (
                            <SelectItem key={project.projectId} value={project.projectId}>
                              {project.name} ({project.projectId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div>
                        {match.project ? (
                          <div>
                            <div className="font-medium">{match.project.name}</div>
                            <div className="text-sm text-gray-500">{match.project.projectId}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not assigned</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {match.confidence ? `${match.confidence}%` : "N/A"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(match.matchStatus, match.confidence)}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {editingMatch?.id === match.id ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingMatch(null)}
                          >
                            Cancel
                          </Button>
                          <Button 
                            size="sm"
                            onClick={handleUpdateAssignment}
                            disabled={updateMutation.isPending}
                          >
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(match)}
                          >
                            <Edit size={16} />
                          </Button>
                          {match.matchStatus === "pending" && (
                            <>
                              <Button 
                                size="sm"
                                onClick={() => handleMatch(match)}
                                disabled={updateMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle size={16} />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleReject(match)}
                                disabled={updateMutation.isPending}
                                className="text-red-600 hover:text-red-700"
                              >
                                <XCircle size={16} />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}