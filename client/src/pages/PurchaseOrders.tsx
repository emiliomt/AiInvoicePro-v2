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
import { Plus, FileText, Calendar, DollarSign, Building, Package, Trash2 } from "lucide-react";
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

  const uploadPOMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch("/api/upload-po", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload purchase orders");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setIsUploadDialogOpen(false);
      setSelectedFiles([]);
      setExtractedPOData(data); // Store the extracted data
      toast({
        title: "Success",
        description: "Purchase orders uploaded successfully",
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
                    <Button onClick={handleUploadPO} disabled={uploadPOMutation.isLoading}>
                      {uploadPOMutation.isLoading ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                  {extractedPOData && (
                    <div>
                      <p>Extracted Data:</p>
                      <pre>{JSON.stringify(extractedPOData, null, 2)}</pre>
                      <Button onClick={handleUseExtractedData}>
                        Use Extracted Data
                      </Button>
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
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center space-x-2">
                          <FileText className="text-blue-600" size={20} />
                          <span>{po.poId}</span>
                        </CardTitle>
                        <p className="text-gray-600 mt-1">{po.vendorName}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(po.status)}>
                          {po.status.toUpperCase()}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePO(po.id, po.poId)}
                          disabled={deletePOMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
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
      </div>
    </div>
  );
}