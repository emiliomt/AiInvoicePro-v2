import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Calendar, DollarSign, Building, Package, Trash2, Loader2, Eye, Edit, Settings } from "lucide-react";
import { useState } from "react";

interface PurchaseOrder {
  id: number;
  poId: string;
  vendorName: string;
  projectId: string | null;
  amount: string;
  currency: string;
  items: any[];
  issueDate: string;
  expectedDeliveryDate: string | null;
  status: "open" | "partial" | "closed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  originalOrderNumber?: string;
  buyerName?: string;
  buyerAddress?: string;
  vendorAddress?: string;
  terms?: string;
  ocrText?: string;
  uploadedBy?: string;
}

interface Project {
  id: number;
  projectId: string;
  name: string;
  status: string;
}

export default function PurchaseOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPO, setNewPO] = useState({
    poId: '',
    vendorName: '',
    projectId: '',
    amount: '',
    currency: 'USD',
    items: [{ description: '', quantity: '', unitPrice: '' }],
    issueDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    status: 'open' as const
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [extractedPOData, setExtractedPOData] = useState<any>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedPOForDetails, setSelectedPOForDetails] = useState<PurchaseOrder | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isAssignProjectDialogOpen, setIsAssignProjectDialogOpen] = useState(false);
  const [selectedPOForAssignment, setSelectedPOForAssignment] = useState<PurchaseOrder | null>(null);
  const [assignmentProjectId, setAssignmentProjectId] = useState("");

  // Fetch purchase orders
  const { data: purchaseOrders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Create purchase order mutation
  const createPOMutation = useMutation({
    mutationFn: async (poData: any) => {
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(poData),
      });

      if (!response.ok) {
        throw new Error("Failed to create purchase order");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setIsCreateDialogOpen(false);
      setNewPO({
        poId: '',
        vendorName: '',
        projectId: '',
        amount: '',
        currency: 'USD',
        items: [{ description: '', quantity: '', unitPrice: '' }],
        issueDate: new Date().toISOString().split('T')[0],
        expectedDeliveryDate: '',
        status: 'open'
      });
      toast({
        title: "Success",
        description: "Purchase order created successfully",
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

  // Upload purchase order mutation
  const uploadPOMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('po', file);
      });

      const response = await fetch("/api/purchase-orders/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to upload purchase orders";

        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorMessage;
        } catch {
          // If parsing fails, use the raw text or default message
          errorMessage = errorText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      const responseText = await response.text();

      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse response:", responseText);
        throw new Error("Invalid response format from server");
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `${selectedFiles.length} purchase order(s) uploaded and processed successfully.`,
      });
      setExtractedPOData(data.extractedData);
      setSelectedFiles([]);
      setIsUploadDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    },
    onError: (error: Error) => {
      let errorMessage = error.message;
      let errorTitle = "Error";

      // Handle specific error cases
      if (error.message.includes("already exists")) {
        errorTitle = "Duplicate Purchase Order";
        errorMessage = error.message;
      } else if (error.message.includes("duplicate key")) {
        errorTitle = "Duplicate Purchase Order";
        errorMessage = "This Purchase Order ID already exists in the system. Please check existing POs or try a different document.";
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete purchase order mutation
  const deletePOMutation = useMutation({
    mutationFn: async (poId: number) => {
      const response = await fetch(`/api/purchase-orders/${poId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete purchase order");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order deleted successfully",
      });
    },
    onError: (error: Error) => {
      let errorMessage = error.message;
      let errorTitle = "Error";

      // Handle specific error cases
      if (error.message.includes("already exists")) {
        errorTitle = "Duplicate Purchase Order";
        errorMessage = error.message;
      } else if (error.message.includes("duplicate key")) {
        errorTitle = "Duplicate Purchase Order";
        errorMessage = "This Purchase Order ID already exists in the system. Please check existing POs or try a different document.";
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Update purchase order project assignment mutation
  const updatePOProjectMutation = useMutation({
    mutationFn: async ({ poId, projectId }: { poId: number; projectId: string | null }) => {
      const response = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update purchase order");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setIsAssignProjectDialogOpen(false);
      setSelectedPOForAssignment(null);
      setAssignmentProjectId("");
      toast({
        title: "Success",
        description: "Project assignment updated successfully",
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

  const handleCreatePO = () => {
    // Validate required fields
    if (!newPO.poId || !newPO.vendorName || !newPO.amount) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Calculate total amount if items are provided
    const totalAmount = newPO.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity || '0');
      const unitPrice = parseFloat(item.unitPrice || '0');
      return sum + (quantity * unitPrice);
    }, 0);

    const poData = {
      ...newPO,
      amount: totalAmount > 0 ? totalAmount.toString() : newPO.amount,
      issueDate: new Date(newPO.issueDate),
      expectedDeliveryDate: newPO.expectedDeliveryDate ? new Date(newPO.expectedDeliveryDate) : null,
      items: newPO.items.filter(item => item.description.trim() !== '')
    };

    createPOMutation.mutate(poData);
  };

  const handleDeletePO = (poId: number, poNumber: string) => {
    if (confirm(`Are you sure you want to delete PO ${poNumber}?`)) {
      deletePOMutation.mutate(poId);
    }
  };

  const handleFileSelect = (files: File[]) => {
    setSelectedFiles(files);
  };

  const handleUploadPO = () => {
    if (selectedFiles.length > 0) {
      uploadPOMutation.mutate(selectedFiles);
    }
  };

  const handleUseExtractedData = () => {
    if (extractedPOData) {
      setNewPO({
        poId: extractedPOData.poId || '',
        vendorName: extractedPOData.vendorName || '',
        projectId: extractedPOData.projectId || '',
        amount: extractedPOData.totalAmount || '',
        currency: extractedPOData.currency || 'USD',
        items: extractedPOData.lineItems || [{ description: '', quantity: '', unitPrice: '' }],
        issueDate: extractedPOData.issueDate || new Date().toISOString().split('T')[0],
        expectedDeliveryDate: extractedPOData.expectedDeliveryDate || '',
        status: 'open' as const
      });
      setIsUploadDialogOpen(false);
      setIsCreateDialogOpen(true);
      setExtractedPOData(null);
    }
  };

  const handleViewPODetails = (po: PurchaseOrder) => {
    setSelectedPOForDetails(po);
    setIsDetailsDialogOpen(true);
  };

  const handleAssignProject = (po: PurchaseOrder) => {
    setSelectedPOForAssignment(po);
    setAssignmentProjectId(po.projectId || "");
    setIsAssignProjectDialogOpen(true);
  };

  const handleUpdateProjectAssignment = () => {
    if (selectedPOForAssignment) {
      updatePOProjectMutation.mutate({
        poId: selectedPOForAssignment.id,
        projectId: assignmentProjectId || null,
      });
    }
  };

  const addItem = () => {
    setNewPO(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: '', unitPrice: '' }]
    }));
  };

  const removeItem = (index: number) => {
    setNewPO(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index: number, field: string, value: string) => {
    setNewPO(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div>Loading purchase orders...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
            <p className="text-gray-600 mt-2">
              Manage and track purchase orders
            </p>
          </div>

          <div className="flex space-x-4">
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Upload PO
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload Purchase Orders (PDF)</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFileSelect(Array.from(e.target.files));
                      }
                    }}
                  />
                  {selectedFiles.length > 0 && (
                    <div>
                      <p>Selected Files:</p>
                      <ul>
                        {selectedFiles.map((file) => (
                          <li key={file.name}>{file.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={() => setIsUploadDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUploadPO} disabled={uploadPOMutation.isPending}>
                    {uploadPOMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload"
                      )}
                    </Button>
                  </div>
                  {extractedPOData && (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900">Extracted Purchase Order Data</h3>
                        <Button onClick={handleUseExtractedData} size="sm">
                          Use This Data
                        </Button>
                      </div>

                      {/* Basic Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                        <div>
                          <label className="text-sm font-medium text-gray-700">PO Number</label>
                          <p className="text-sm text-gray-900 mt-1">{extractedPOData.poId || "Not extracted"}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Vendor Name</label>
                          <p className="text-sm text-gray-900 mt-1">{extractedPOData.vendorName || "Not extracted"}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Total Amount</label>
                          <p className="text-sm text-gray-900 mt-1">
                            {extractedPOData.currency || "COP"} {extractedPOData.totalAmount || "0.00"}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Issue Date</label>
                          <p className="text-sm text-gray-900 mt-1">
                            {extractedPOData.issueDate ? new Date(extractedPOData.issueDate).toLocaleDateString() : "Not extracted"}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Project Name</label>
                          <p className="text-sm text-gray-900 mt-1">{extractedPOData.projectId || "Not extracted"}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Expected Delivery</label>
                          <p className="text-sm text-gray-900 mt-1">
                            {extractedPOData.expectedDeliveryDate ? new Date(extractedPOData.expectedDeliveryDate).toLocaleDateString() : "Not extracted"}
                          </p>
                        </div>
                      </div>

                      {/* Additional Details */}
                      {(extractedPOData.buyerName || extractedPOData.buyerAddress || extractedPOData.vendorAddress || extractedPOData.terms) && (
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-3">Additional Information</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {extractedPOData.buyerName && (
                              <div>
                                <label className="text-sm font-medium text-gray-700">Buyer Name</label>
                                <p className="text-sm text-gray-900 mt-1">{extractedPOData.buyerName}</p>
                              </div>
                            )}
                            {extractedPOData.buyerAddress && (
                              <div>
                                <label className="text-sm font-medium text-gray-700">Buyer Address</label>
                                <p className="text-sm text-gray-900 mt-1">{extractedPOData.buyerAddress}</p>
                              </div>
                            )}
                            {extractedPOData.vendorAddress && (
                              <div>
                                <label className="text-sm font-medium text-gray-700">Vendor Address</label>
                                <p className="text-sm text-gray-900 mt-1">{extractedPOData.vendorAddress}</p>
                              </div>
                            )}
                            {extractedPOData.terms && (
                              <div className="md:col-span-2">
                                <label className="text-sm font-medium text-gray-700">Terms & Conditions</label>
                                <p className="text-sm text-gray-900 mt-1">{extractedPOData.terms}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Line Items */}
                      {extractedPOData.lineItems && extractedPOData.lineItems.length > 0 && (
                        <div className="p-4 bg-green-50 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-3">Line Items ({extractedPOData.lineItems.length})</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-white">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-gray-700">Description</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Quantity</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Unit Price</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-700">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {extractedPOData.lineItems.map((item: any, index: number) => (
                                  <tr key={index} className="bg-white">
                                    <td className="px-3 py-2">{item.description || "—"}</td>
                                    <td className="px-3 py-2 text-right">{item.quantity || "—"}</td>
                                    <td className="px-3 py-2 text-right">
                                      {item.unitPrice ? `${extractedPOData.currency || "COP"} ${item.unitPrice}` : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium">
                                      {item.totalPrice ? `${extractedPOData.currency || "COP"} ${item.totalPrice}` : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Confidence Score */}
                      {extractedPOData.confidenceScore && (
                        <div className="p-4 bg-yellow-50 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-2">AI Extraction Confidence</h4>
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${parseFloat(extractedPOData.confidenceScore) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium">
                              {(parseFloat(extractedPOData.confidenceScore) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Raw JSON for debugging */}
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                          View Raw Extracted Data (for debugging)
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                          {JSON.stringify(extractedPOData, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create PO
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Purchase Order</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="poId">PO ID *</Label>
                      <Input
                        id="poId"
                        value={newPO.poId}
                        onChange={(e) => setNewPO(prev => ({ ...prev, poId: e.target.value }))}
                        placeholder="PO-2024-001"
                      />
                    </div>

                    <div>
                      <Label htmlFor="vendorName">Vendor Name *</Label>
                      <Input
                        id="vendorName"
                        value={newPO.vendorName}
                        onChange={(e) => setNewPO(prev => ({ ...prev, vendorName: e.target.value }))}
                        placeholder="Vendor name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="projectId">Project</Label>
                      <Select 
                        value={newPO.projectId} 
                        onValueChange={(value) => setNewPO(prev => ({ ...prev, projectId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.projectId} value={project.projectId}>
                              {project.name} ({project.projectId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="amount">Total Amount *</Label>
                      <div className="flex">
                        <Select 
                          value={newPO.currency} 
                          onValueChange={(value) => setNewPO(prev => ({ ...prev, currency: value }))}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="MXN">MXN</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          value={newPO.amount}
                          onChange={(e) => setNewPO(prev => ({ ...prev, amount: e.target.value }))}
                          placeholder="0.00"
                          className="ml-2"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="issueDate">Issue Date</Label>
                      <Input
                        id="issueDate"
                        type="date"
                        value={newPO.issueDate}
                        onChange={(e) => setNewPO(prev => ({ ...prev, issueDate: e.target.value }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="expectedDeliveryDate">Expected Delivery</Label>
                      <Input
                        id="expectedDeliveryDate"
                        type="date"
                        value={newPO.expectedDeliveryDate}
                        onChange={(e) => setNewPO(prev => ({ ...prev, expectedDeliveryDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <Label>Line Items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addItem}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add Item
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {newPO.items.map((item, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 border rounded-lg">
                          <div className="md:col-span-2">
                            <Input
                              placeholder="Item description"
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                            />
                          </div>
                          <div>
                            <Input
                              type="number"
                              placeholder="Quantity"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                            />
                          </div>
                          <div className="flex">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Unit price"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                            />
                            {newPO.items.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItem(index)}
                                className="ml-2"
                              >
                                ×
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreatePO}
                      disabled={createPOMutation.isPending}
                    >
                      {createPOMutation.isPending ? 'Creating...' : 'Create PO'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Purchase Orders List */}
        <div className="space-y-6">
          {purchaseOrders.length > 0 ? (
            <div className="grid gap-6">
              {purchaseOrders.map((po) => (
                <Card key={po.id}>
                  
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div>
                          <CardTitle className="text-lg">{po.poId}</CardTitle>
                          {po.originalOrderNumber && po.originalOrderNumber !== po.poId && (
                            <p className="text-sm text-gray-500">Order: {po.originalOrderNumber}</p>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant={
                          po.status === "open" ? "default" :
                          po.status === "partial" ? "secondary" :
                          po.status === "closed" ? "outline" : "destructive"
                        }
                      >
                        {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="text-green-600" size={16} />
                        <div>
                          <p className="text-sm text-gray-600">Amount</p>
                          <p className="font-medium">{po.currency} {po.amount}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Building className="text-purple-600" size={16} />
                        <div>
                          <p className="text-sm text-gray-600">Project</p>
                          <p className="font-medium">{po.projectId || 'Unassigned'}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Calendar className="text-orange-600" size={16} />
                        <div>
                          <p className="text-sm text-gray-600">Issue Date</p>
                          <p className="font-medium">
                            {new Date(po.issueDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Package className="text-gray-600" size={16} />
                        <div>
                          <p className="text-sm text-gray-600">Items</p>
                          <p className="font-medium">{po.items.length} item(s)</p>
                        </div>
                      </div>
                    </div>

                    {po.items.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-medium text-gray-700 mb-2">Line Items:</p>
                        <div className="space-y-1">
                          {po.items.slice(0, 3).map((item: any, index: number) => (
                            <div key={index} className="text-sm text-gray-600">
                              {item.description} - Qty: {item.quantity || 'N/A'} @ {po.currency} {item.unitPrice || 'N/A'}
                            </div>
                          ))}
                          {po.items.length > 3 && (
                            <div className="text-sm text-gray-500">
                              +{po.items.length - 3} more items
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewPODetails(po)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignProject(po)}
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        Assign Project
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePO(po.id, po.poId)}
                        disabled={deletePOMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Purchase Orders</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first purchase order.
                </p>
                <div className="mt-6">
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Purchase Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Purchase Order Details Dialog */}
        {selectedPOForDetails && (
          <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Purchase Order Details - {selectedPOForDetails.poId}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-700">PO Number</label>
                    <p className="text-sm text-gray-900 mt-1 font-semibold">{selectedPOForDetails.poId}</p>
                  </div>
                  {selectedPOForDetails.originalOrderNumber && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Original Order Number</label>
                      <p className="text-sm text-gray-900 mt-1">{selectedPOForDetails.originalOrderNumber}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <p className="text-sm text-gray-900 mt-1">
                      <Badge className={getStatusColor(selectedPOForDetails.status)}>
                        {selectedPOForDetails.status.toUpperCase()}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Vendor Name</label>
                    <p className="text-sm text-gray-900 mt-1 font-semibold">{selectedPOForDetails.vendorName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Total Amount</label>
                    <p className="text-sm text-gray-900 mt-1 font-semibold text-green-600">
                      {selectedPOForDetails.currency} {parseFloat(selectedPOForDetails.amount).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Project Assignment</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {selectedPOForDetails.projectId ? (
                        <Badge variant="secondary">{selectedPOForDetails.projectId}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600">Unassigned</Badge>
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Issue Date</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(selectedPOForDetails.issueDate).toLocaleDateString()}
                    </p>
                  </div>
                  {selectedPOForDetails.expectedDeliveryDate && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Expected Delivery</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {new Date(selectedPOForDetails.expectedDeliveryDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selectedPOForDetails.fileName && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Source File</label>
                      <p className="text-sm text-gray-900 mt-1 truncate" title={selectedPOForDetails.fileName}>
                        {selectedPOForDetails.fileName}
                      </p>
                    </div>
                  )}
                </div>

                {/* Additional Extracted Information */}
                {(selectedPOForDetails.buyerName || selectedPOForDetails.buyerAddress || selectedPOForDetails.vendorAddress || selectedPOForDetails.terms) && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Additional Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedPOForDetails.buyerName && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Buyer Name</label>
                          <p className="text-sm text-gray-900 mt-1">{selectedPOForDetails.buyerName}</p>
                        </div>
                      )}
                      {selectedPOForDetails.buyerAddress && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Buyer Address</label>
                          <p className="text-sm text-gray-900 mt-1 whitespace-pre-line">{selectedPOForDetails.buyerAddress}</p>
                        </div>
                      )}
                      {selectedPOForDetails.vendorAddress && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Vendor Address</label>
                          <p className="text-sm text-gray-900 mt-1 whitespace-pre-line">{selectedPOForDetails.vendorAddress}</p>
                        </div>
                      )}
                      {selectedPOForDetails.terms && (
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-700">Terms & Conditions</label>
                          <p className="text-sm text-gray-900 mt-1 whitespace-pre-line">{selectedPOForDetails.terms}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Line Items */}
                {selectedPOForDetails.items && selectedPOForDetails.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Line Items ({selectedPOForDetails.items.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-900">
                              #
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-900">
                              Description
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-900">
                              Quantity
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-900">
                              Unit Price
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-900">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPOForDetails.items.map((item: any, index: number) => {
                            const quantity = parseFloat(item.quantity || '0');
                            const unitPrice = parseFloat(item.unitPrice || '0');
                            const total = quantity * unitPrice;
                            
                            return (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900 font-medium">
                                  {index + 1}
                                </td>
                                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900">
                                  {item.description || 'N/A'}
                                </td>
                                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900 text-center">
                                  {item.quantity || 'N/A'}
                                </td>
                                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900 text-right">
                                  {selectedPOForDetails.currency} {unitPrice > 0 ? unitPrice.toLocaleString() : 'N/A'}
                                </td>
                                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900 text-right font-medium">
                                  {total > 0 ? `${selectedPOForDetails.currency} ${total.toLocaleString()}` : 'N/A'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* OCR Text Preview */}
                {selectedPOForDetails.ocrText && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Extracted Text (OCR)</h3>
                    <div className="max-h-40 overflow-y-auto text-sm text-gray-700 whitespace-pre-line font-mono bg-white p-3 rounded border">
                      {selectedPOForDetails.ocrText.substring(0, 1000)}
                      {selectedPOForDetails.ocrText.length > 1000 && '...'}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-100 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Created</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(selectedPOForDetails.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Last Updated</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(selectedPOForDetails.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedPOForDetails.uploadedBy && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Uploaded By</label>
                      <p className="text-sm text-gray-900 mt-1">{selectedPOForDetails.uploadedBy}</p>
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Project Assignment Dialog */}
        {selectedPOForAssignment && (
          <Dialog open={isAssignProjectDialogOpen} onOpenChange={setIsAssignProjectDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assign Project - {selectedPOForAssignment.poId}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project-select">Select Project</Label>
                  <Select value={assignmentProjectId} onValueChange={setAssignmentProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a project or leave unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.projectId}>
                          {project.projectId} - {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Current Assignment</h4>
                  <p className="text-sm text-gray-900">
                    {selectedPOForAssignment.projectId ? (
                      <Badge variant="secondary">{selectedPOForAssignment.projectId}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">Unassigned</Badge>
                    )}
                  </p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="secondary" onClick={() => setIsAssignProjectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpdateProjectAssignment}
                    disabled={updatePOProjectMutation.isPending}
                  >
                    {updatePOProjectMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Assignment'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Original Extracted Data</h4>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                        View Raw Extracted Data
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify((selectedPOForDetails as any).extractedData, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}