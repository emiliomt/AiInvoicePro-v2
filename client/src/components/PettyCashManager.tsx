import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Upload, CheckCircle, XCircle, Clock, Edit, Trash2 } from "lucide-react";

interface PettyCashLog {
  id: number;
  invoiceId: number;
  projectId: string | null;
  costCenter: string | null;
  approvedBy: string | null;
  approvalFileUrl: string | null;
  status: "pending_approval" | "approved" | "rejected";
  approvalNotes: string | null;
  approvedAt: string | null;
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
}

interface PettyCashManagerProps {
  invoiceId?: number;
  showAllLogs?: boolean;
  filterStatus?: string;
  filterAssigned?: boolean;
}

export default function PettyCashManager({ invoiceId, showAllLogs = false, filterStatus, filterAssigned }: PettyCashManagerProps) {
  const [editingLog, setEditingLog] = useState<PettyCashLog | null>(null);
  const [formData, setFormData] = useState({
    projectId: "",
    costCenter: "",
    approvalNotes: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch petty cash logs
  const { data: pettyCashLogs, isLoading } = useQuery({
    queryKey: showAllLogs 
      ? ["/api/petty-cash", { filterStatus, filterAssigned }] 
      : ["/api/petty-cash/invoice", invoiceId],
    enabled: showAllLogs || !!invoiceId,
    select: (data: any) => {
      if (!showAllLogs || !data) return data;
      
      let filteredData = Array.isArray(data) ? data : [data];
      
      // Filter by status if specified
      if (filterStatus) {
        filteredData = filteredData.filter(log => log.status === filterStatus);
      }
      
      // Filter by assigned status if specified
      if (filterAssigned) {
        filteredData = filteredData.filter(log => log.costCenter && log.costCenter.trim() !== "");
      }
      
      return filteredData;
    }
  });

  // Update petty cash log mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await fetch(`/api/petty-cash/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error("Failed to update petty cash log");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      setEditingLog(null);
      setFormData({ projectId: "", costCenter: "", approvalNotes: "" });
      toast({
        title: "Success",
        description: "Petty cash log updated successfully",
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

  const handleEdit = (log: PettyCashLog) => {
    setEditingLog(log);
    setFormData({
      projectId: log.projectId || "",
      costCenter: log.costCenter || "",
      approvalNotes: log.approvalNotes || "",
    });
  };

  const handleApprove = (log: PettyCashLog) => {
    updateMutation.mutate({
      id: log.id,
      updates: {
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvalNotes: formData.approvalNotes || "",
        costCenter: "Petty Cash", // Auto-assign to Petty Cash cost center
      },
    });
  };

  const handleReject = (log: PettyCashLog) => {
    updateMutation.mutate({
      id: log.id,
      updates: {
        status: "rejected",
        approvalNotes: formData.approvalNotes || "",
        costCenter: "Petty Cash", // Auto-assign to Petty Cash cost center
      },
    });
  };

  const handleUpdateAssignment = () => {
    if (!editingLog) return;

    updateMutation.mutate({
      id: editingLog.id,
      updates: {
        projectId: formData.projectId,
        costCenter: formData.costCenter,
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_approval":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock size={14} className="mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle size={14} className="mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle size={14} className="mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div>Loading petty cash information...</div>;
  }

  // Single invoice view
  if (!showAllLogs && invoiceId) {
    const pettyCashLog = pettyCashLogs as PettyCashLog;

    if (!pettyCashLog) {
      return null; // Not a petty cash invoice
    }

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="text-green-600" size={20} />
            <span>Petty Cash Invoice</span>
            {getStatusBadge(pettyCashLog.status)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="projectId">Project ID</Label>
              <Input
                id="projectId"
                value={editingLog?.id === pettyCashLog.id ? formData.projectId : pettyCashLog.projectId || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
                placeholder="Enter project ID"
                disabled={!editingLog || editingLog.id !== pettyCashLog.id}
              />
            </div>
            <div>
              <Label htmlFor="costCenter">Cost Center</Label>
              <Input
                id="costCenter"
                value={editingLog?.id === pettyCashLog.id ? formData.costCenter : pettyCashLog.costCenter || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, costCenter: e.target.value }))}
                placeholder="Enter cost center"
                disabled={!editingLog || editingLog.id !== pettyCashLog.id}
              />
            </div>
          </div>

          {pettyCashLog.status === "pending_approval" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="approvalNotes">Approval Notes</Label>
                <Textarea
                  id="approvalNotes"
                  value={formData.approvalNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, approvalNotes: e.target.value }))}
                  placeholder="Enter approval notes..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Upload Approval Document</Label>
                <FileUpload
                  onFileSelect={(file: File) => {
                    // Handle file upload for approval document
                    console.log("File selected:", file);
                  }}
                  accept={{ "application/pdf": [".pdf"], "image/*": [".jpg", ".jpeg", ".png"] }}
                  maxSize={10 * 1024 * 1024} // 10MB
                  className="mt-2"
                />
              </div>

              <div className="flex space-x-2">
                {editingLog?.id === pettyCashLog.id ? (
                  <>
                    <Button onClick={handleUpdateAssignment} disabled={updateMutation.isPending}>
                      Update Assignment
                    </Button>
                    <Button onClick={() => setEditingLog(null)} variant="outline">
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => handleEdit(pettyCashLog)} variant="outline">
                    Edit Assignment
                  </Button>
                )}
                <Button onClick={() => handleApprove(pettyCashLog)} disabled={updateMutation.isPending}>
                  Approve
                </Button>
                <Button onClick={() => handleReject(pettyCashLog)} variant="destructive" disabled={updateMutation.isPending}>
                  Reject
                </Button>
              </div>
            </div>
          )}

          {pettyCashLog.approvalNotes && (
            <div>
              <Label>Notes</Label>
              <div className="bg-gray-50 p-3 rounded-md text-sm">
                {pettyCashLog.approvalNotes}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // All logs view
  const logs = pettyCashLogs as PettyCashLog[];

  // Check if we should show table view (for approved records)
  const showTableView = filterStatus === "approved";

  if (showTableView) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="text-green-600" size={20} />
                <span>Approved Petty Cash Records</span>
              </div>
              <p className="text-sm text-gray-500">
                Records automatically assigned to Petty Cash cost center when approved
              </p>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs && logs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Project ID</TableHead>
                      <TableHead>Cost Center</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Approved Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{log.invoice.vendorName || "Unknown Vendor"}</p>
                            <p className="text-xs text-gray-500">{log.invoice.fileName}</p>
                          </div>
                        </TableCell>
                        <TableCell>{log.invoice.invoiceNumber || "—"}</TableCell>
                        <TableCell>
                          <span className="font-medium">${log.invoice.totalAmount}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{log.projectId || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {log.costCenter || "Petty Cash"}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.approvedBy || "—"}</TableCell>
                        <TableCell>
                          {log.approvedAt ? new Date(log.approvedAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle size={14} className="mr-1" />
                            Approved
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(log)}>
                              <Edit size={14} className="mr-1" />
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Approved Records</h3>
                <p className="text-gray-500">No petty cash records have been approved yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Modal/Form */}
        {editingLog && (
          <Card>
            <CardHeader>
              <CardTitle>Edit Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="projectId">Project ID</Label>
                  <Input
                    id="projectId"
                    value={formData.projectId}
                    onChange={(e) => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
                    placeholder="Enter project ID"
                  />
                </div>
                <div>
                  <Label htmlFor="costCenter">Cost Center</Label>
                  <Input
                    id="costCenter"
                    value={formData.costCenter}
                    onChange={(e) => setFormData(prev => ({ ...prev, costCenter: e.target.value }))}
                    placeholder="Enter cost center"
                  />
                </div>
              </div>
              <div className="flex space-x-2">
                <Button onClick={handleUpdateAssignment} disabled={updateMutation.isPending}>
                  Update Assignment
                </Button>
                <Button onClick={() => setEditingLog(null)} variant="outline">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="text-green-600" size={20} />
            <span>Petty Cash Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="space-y-4">
              {logs.map((log) => (
                <Card key={log.id} className="border-l-4 border-l-green-500">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{log.invoice.vendorName || "Unknown Vendor"}</h4>
                        <p className="text-sm text-gray-600">
                          Invoice #{log.invoice.invoiceNumber} • ${log.invoice.totalAmount}
                        </p>
                        <p className="text-xs text-gray-500">
                          Project: {log.projectId || "Unassigned"} • Cost Center: {log.costCenter || "Unassigned"}
                        </p>
                      </div>
                      {getStatusBadge(log.status)}
                    </div>

                    {log.status === "pending_approval" && (
                      <div className="flex space-x-2 mt-3">
                        <Button size="sm" onClick={() => handleEdit(log)} variant="outline">
                          Edit
                        </Button>
                        <Button size="sm" onClick={() => handleApprove(log)}>
                          Approve
                        </Button>
                        <Button size="sm" onClick={() => handleReject(log)} variant="destructive">
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No petty cash invoices found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}