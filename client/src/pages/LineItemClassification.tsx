import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Brain, Tag, FileText, TrendingUp, Download, Upload, RefreshCcw, FileCheck, CheckCircle, Play, Plus, Trash2, Target, Bot, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";

interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  rawText?: string;
}

interface ClassificationResult {
  category: string;
  confidence: number;
  method: 'keyword' | 'ai' | 'fuzzy' | 'context' | 'learned' | 'manual';
  subcategory?: string;
  reasoning?: string;
  keywords_matched?: string[];
}

interface VendorContext {
  vendorName?: string;
  industry?: string;
  businessType?: string;
}

interface InvoiceForProcessing {
  id: number;
  invoiceNumber: string;
  vendorName: string;
  totalAmount: string;
  currency: string;
  invoiceDate: string;
  status: string;
  projectId: string;
  matchScore: string;
  lineItemsExtracted: boolean;
  hasClassifications: boolean;
  lineItemsCount: number;
}

interface ProcessingProgress {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  totalInvoices: number;
  processedInvoices: number;
  currentInvoice?: string;
  sessionId?: string;
}

export default function LineItemClassification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [lineItem, setLineItem] = useState<LineItem>({
    description: "",
    quantity: undefined,
    unitPrice: undefined,
    totalPrice: undefined,
    unit: "",
    rawText: ""
  });

  const [vendorContext, setVendorContext] = useState<VendorContext>({
    vendorName: "",
    industry: "",
    businessType: ""
  });

  const [batchItems, setBatchItems] = useState<LineItem[]>([]);
  const [batchText, setBatchText] = useState("");
  const [currentTab, setCurrentTab] = useState("single");

  // Invoice processing state
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [processingSessionId, setProcessingSessionId] = useState<string>("");

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['/api/classification/categories'],
    queryFn: () => apiRequest('/api/classification/categories'),
  });

  // Fetch invoices ready for line item classification
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<{
    invoices: InvoiceForProcessing[];
    count: number;
  }>({
    queryKey: ['/api/invoices/ready-for-line-item-classification', { filterProjectId, filterDateFrom, filterDateTo, filterStatus }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterProjectId) params.append('projectId', filterProjectId);
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);
      if (filterStatus) params.append('status', filterStatus);

      return apiRequest(`/api/invoices/ready-for-line-item-classification?${params.toString()}`);
    },
    enabled: currentTab === 'process'
  });

  // Single item classification mutation
  const classifyMutation = useMutation({
    mutationFn: (data: { lineItem: LineItem; vendorContext: VendorContext }) =>
      apiRequest('/api/classification/classify', {
        method: 'POST',
        body: JSON.stringify({
          ...data.lineItem,
          vendorContext: data.vendorContext
        })
      }),
    onSuccess: (result) => {
      toast({
        title: "Classification Complete",
        description: `Classified as ${result.category} with ${(result.confidence * 100).toFixed(1)}% confidence`
      });
    },
    onError: (error) => {
      toast({
        title: "Classification Failed",
        description: "Unable to classify line item. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Batch classification mutation
  const batchClassifyMutation = useMutation({
    mutationFn: (data: { lineItems: LineItem[]; vendorContext: VendorContext }) =>
      apiRequest('/api/classification/batch', {
        method: 'POST',
        body: JSON.stringify({
          lineItems: data.lineItems,
          vendorContext: data.vendorContext
        })
      }),
    onSuccess: (results) => {
      toast({
        title: "Batch Classification Complete",
        description: `Successfully classified ${results.results.length} items`
      });
    },
    onError: (error) => {
      toast({
        title: "Batch Classification Failed",
        description: "Unable to classify items. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Process invoices mutation
  const processInvoicesMutation = useMutation({
    mutationFn: (data: { invoiceIds: number[]; filters?: any }) =>
      apiRequest('/api/process-invoices-line-items', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: (result) => {
      setProcessingSessionId(result.sessionId);
      toast({
        title: "Processing Started",
        description: "Invoice processing has begun. You can track progress below.",
      });
    },
    onError: (error) => {
      toast({
        title: "Processing Failed",
        description: "Unable to start invoice processing. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Test classification mutation
  const testMutation = useMutation({
    mutationFn: () => apiRequest('/api/classification/test', { method: 'POST' }),
    onSuccess: (results) => {
      toast({
        title: "Test Complete",
        description: `Tested with ${results.results.length} sample items`
      });
    }
  });

  const handleSingleClassify = () => {
    if (!lineItem.description.trim()) {
      toast({
        title: "Missing Description",
        description: "Please enter a line item description",
        variant: "destructive"
      });
      return;
    }

    classifyMutation.mutate({ lineItem, vendorContext });
  };

  const handleBatchClassify = () => {
    if (batchItems.length === 0) {
      toast({
        title: "No Items to Classify",
        description: "Please add items to the batch first",
        variant: "destructive"
      });
      return;
    }

    batchClassifyMutation.mutate({ lineItems: batchItems, vendorContext });
  };

  const parseBatchText = () => {
    if (!batchText.trim()) return;

    const lines = batchText.split('\n').filter(line => line.trim());
    const items: LineItem[] = lines.map(line => {
      // Simple parsing - can be enhanced
      const parts = line.split('\t'); // Tab-separated
      if (parts.length >= 1) {
        return {
          description: parts[0].trim(),
          quantity: parts[1] ? parseFloat(parts[1]) : undefined,
          unitPrice: parts[2] ? parseFloat(parts[2]) : undefined,
          unit: parts[3]?.trim() || "",
          rawText: line
        };
      }
      return { description: line.trim(), rawText: line };
    });

    setBatchItems(items);
    setBatchText("");
    toast({
      title: "Items Parsed",
      description: `Added ${items.length} items to batch`
    });
  };

  const addBatchItem = () => {
    setBatchItems([...batchItems, { description: "", rawText: "" }]);
  };

  const updateBatchItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...batchItems];
    updated[index] = { ...updated[index], [field]: value };
    setBatchItems(updated);
  };

  const removeBatchItem = (index: number) => {
    setBatchItems(batchItems.filter((_, i) => i !== index));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'materials_supplies': 'bg-blue-100 text-blue-800',
      'equipment_tools': 'bg-green-100 text-green-800',
      'services_labor': 'bg-purple-100 text-purple-800',
      'utilities_facilities': 'bg-yellow-100 text-yellow-800',
      'food_beverages': 'bg-orange-100 text-orange-800',
      'transportation_logistics': 'bg-red-100 text-red-800',
      'technology_software': 'bg-indigo-100 text-indigo-800',
      'marketing_advertising': 'bg-pink-100 text-pink-800',
      'other': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.other;
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'ai': return <Brain className="h-4 w-4" />;
      case 'keyword': return <Tag className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Line Item Classification</h1>
            <p className="text-muted-foreground">
              AI-powered classification of invoice line items for procurement categorization
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <TrendingUp className="h-4 w-4 mr-2" />
              Test System
            </Button>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="single">Single Item</TabsTrigger>
            <TabsTrigger value="batch">Batch Processing</TabsTrigger>
            <TabsTrigger value="process">Process Invoices</TabsTrigger>
            <TabsTrigger value="results">Results & History</TabsTrigger>
          </TabsList>

          {/* Vendor Context Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vendor Context</CardTitle>
              <CardDescription>
                Provide vendor information to improve classification accuracy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vendorName">Vendor Name</Label>
                  <Input
                    id="vendorName"
                    value={vendorContext.vendorName || ""}
                    onChange={(e) => setVendorContext({...vendorContext, vendorName: e.target.value})}
                    placeholder="e.g., ACME Construction"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={vendorContext.industry || ""}
                    onChange={(e) => setVendorContext({...vendorContext, industry: e.target.value})}
                    placeholder="e.g., Construction, Manufacturing"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type</Label>
                  <Input
                    id="businessType"
                    value={vendorContext.businessType || ""}
                    onChange={(e) => setVendorContext({...vendorContext, businessType: e.target.value})}
                    placeholder="e.g., Supplier, Service Provider"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <TabsContent value="single" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Line Item Details</CardTitle>
                  <CardDescription>
                    Enter the details of the line item to classify
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Textarea
                      id="description"
                      value={lineItem.description}
                      onChange={(e) => setLineItem({...lineItem, description: e.target.value})}
                      placeholder="e.g., Cemento portland 50kg"
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={lineItem.quantity || ""}
                        onChange={(e) => setLineItem({...lineItem, quantity: parseFloat(e.target.value) || undefined})}
                        placeholder="10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unit">Unit</Label>
                      <Input
                        id="unit"
                        value={lineItem.unit || ""}
                        onChange={(e) => setLineItem({...lineItem, unit: e.target.value})}
                        placeholder="kg, pieces, hours"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="unitPrice">Unit Price</Label>
                      <Input
                        id="unitPrice"
                        type="number"
                        value={lineItem.unitPrice || ""}
                        onChange={(e) => setLineItem({...lineItem, unitPrice: parseFloat(e.target.value) || undefined})}
                        placeholder="25000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="totalPrice">Total Price</Label>
                      <Input
                        id="totalPrice"
                        type="number"
                        value={lineItem.totalPrice || ""}
                        onChange={(e) => setLineItem({...lineItem, totalPrice: parseFloat(e.target.value) || undefined})}
                        placeholder="250000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rawText">Raw Text (Optional)</Label>
                    <Textarea
                      id="rawText"
                      value={lineItem.rawText || ""}
                      onChange={(e) => setLineItem({...lineItem, rawText: e.target.value})}
                      placeholder="Original text from invoice if different from description"
                      className="min-h-[60px]"
                    />
                  </div>

                  <Button
                    onClick={handleSingleClassify}
                    disabled={classifyMutation.isPending}
                    className="w-full"
                  >
                    {classifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Brain className="h-4 w-4 mr-2" />
                    Classify Item
                  </Button>
                </CardContent>
              </Card>

              {/* Classification Result */}
              <Card>
                <CardHeader>
                  <CardTitle>Classification Result</CardTitle>
                  <CardDescription>
                    AI-powered categorization result
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {classifyMutation.isPending && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Classifying...</span>
                    </div>
                  )}

                  {classifyMutation.data && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Badge className={getCategoryColor(classifyMutation.data.category)}>
                          {classifyMutation.data.category.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <div className="flex items-center space-x-2">
                          {getMethodIcon(classifyMutation.data.method)}
                          <span className="text-sm text-muted-foreground">
                            {classifyMutation.data.method.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Confidence</span>
                          <span className="text-sm">{(classifyMutation.data.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={classifyMutation.data.confidence * 100} className="h-2" />
                      </div>

                      {classifyMutation.data.subcategory && (
                        <div>
                          <span className="text-sm font-medium">Subcategory: </span>
                          <span className="text-sm">{classifyMutation.data.subcategory}</span>
                        </div>
                      )}

                      {classifyMutation.data.reasoning && (
                        <div>
                          <span className="text-sm font-medium">Reasoning: </span>
                          <span className="text-sm text-muted-foreground">{classifyMutation.data.reasoning}</span>
                        </div>
                      )}

                      {classifyMutation.data.keywords_matched && classifyMutation.data.keywords_matched.length > 0 && (
                        <div>
                          <span className="text-sm font-medium">Matched Keywords: </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {classifyMutation.data.keywords_matched.map((keyword, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {classifyMutation.isError && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Classification failed. Please check your input and try again.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!classifyMutation.data && !classifyMutation.isPending && !classifyMutation.isError && (
                    <div className="text-center py-8 text-muted-foreground">
                      Enter a line item description and click "Classify Item" to see results
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="batch" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Batch Input */}
              <Card>
                <CardHeader>
                  <CardTitle>Batch Input</CardTitle>
                  <CardDescription>
                    Add multiple items for bulk classification
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="batchText">Paste Items (Tab-separated)</Label>
                    <Textarea
                      id="batchText"
                      value={batchText}
                      onChange={(e) => setBatchText(e.target.value)}
                      placeholder="Description  Quantity        Unit Price      Unit
Cemento portland        10      25000   kg
Consultoría ingeniería  1       150000  service"
                      className="min-h-[120px] font-mono text-sm"
                    />
                    <Button onClick={parseBatchText} variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Parse Items
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Manual Entry ({batchItems.length} items)</Label>
                      <Button onClick={addBatchItem} variant="outline" size="sm">
                        Add Item
                      </Button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                      {batchItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                          <div className="col-span-6">
                            <Input
                              value={item.description}
                              onChange={(e) => updateBatchItem(index, 'description', e.target.value)}
                              placeholder="Description"
                              size="sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              value={item.quantity || ""}
                              onChange={(e) => updateBatchItem(index, 'quantity', parseFloat(e.target.value) || undefined)}
                              placeholder="Qty"
                              size="sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              value={item.unit || ""}
                              onChange={(e) => updateBatchItem(index, 'unit', e.target.value)}
                              placeholder="Unit"
                              size="sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <Button
                              onClick={() => removeBatchItem(index)}
                              variant="outline"
                              size="sm"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleBatchClassify}
                    disabled={batchClassifyMutation.isPending || batchItems.length === 0}
                    className="w-full"
                  >
                    {batchClassifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Brain className="h-4 w-4 mr-2" />
                    Classify Batch ({batchItems.length} items)
                  </Button>
                </CardContent>
              </Card>

              {/* Batch Results */}
              <Card>
                <CardHeader>
                  <CardTitle>Batch Results</CardTitle>
                  <CardDescription>
                    Classification results for batch processing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {batchClassifyMutation.isPending && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Processing batch...</span>
                    </div>
                  )}

                  {batchClassifyMutation.data?.results && (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {batchClassifyMutation.data.results.map((result: ClassificationResult, index: number) => (
                        <div key={index} className="border rounded p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">
                              {batchItems[index]?.description || `Item ${index + 1}`}
                            </span>
                            <Badge className={getCategoryColor(result.category)}>
                              {result.category.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                              {getMethodIcon(result.method)}
                              <span className="text-xs text-muted-foreground">
                                {result.method}
                              </span>
                            </div>
                            <span className="text-sm">{(result.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <Progress value={result.confidence * 100} className="h-1" />
                        </div>
                      ))}
                    </div>
                  )}

                  {!batchClassifyMutation.data && !batchClassifyMutation.isPending && (
                    <div className="text-center py-8 text-muted-foreground">
                      Add items to batch and click "Classify Batch" to see results
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="process" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Process Invoices for Line Item Classification</CardTitle>
                <CardDescription>
                  Process invoices from the invoiceProjectMatches table to automatically extract and classify their line items
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="projectId">Project ID</Label>
                    <Input
                      id="projectId"
                      placeholder="Enter project ID"
                      value={filterProjectId}
                      onChange={(e) => setFilterProjectId(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dateFrom">Date From</Label>
                    <Input
                      id="dateFrom"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dateTo">Date To</Label>
                    <Input
                      id="dateTo"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background"
                    >
                      <option value="">All Statuses</option>
                      <option value="extracted">Extracted</option>
                      <option value="approved">Approved</option>
                      <option value="verified">Verified</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={() => refetchInvoices()} variant="outline">
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Refresh Invoices
                  </Button>
                  <Button 
                    onClick={() => {
                      if (selectedInvoices.length > 0) {
                        processInvoicesMutation.mutate({ invoiceIds: selectedInvoices });
                      } else {
                        processInvoicesMutation.mutate({ 
                          invoiceIds: [], 
                          filters: { filterProjectId, filterDateFrom, filterDateTo, filterStatus }
                        });
                      }
                    }}
                    disabled={processInvoicesMutation.isPending}
                  >
                    {processInvoicesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileCheck className="h-4 w-4 mr-2" />
                    )}
                    {selectedInvoices.length > 0 
                      ? `Process ${selectedInvoices.length} Selected` 
                      : "Process All Filtered"}
                  </Button>
                </div>

                {/* Processing Status */}
                {processingSessionId && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Processing In Progress</AlertTitle>
                    <AlertDescription>
                      Session ID: {processingSessionId}. The system is processing invoices in the background.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Invoices Table */}
                {invoicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading invoices...</span>
                  </div>
                ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Found {invoicesData.count} invoices ready for processing
                      </p>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedInvoices.length === invoicesData.invoices.length) {
                              setSelectedInvoices([]);
                            } else {
                              setSelectedInvoices(invoicesData.invoices.map(inv => inv.id));
                            }
                          }}
                        >
                          {selectedInvoices.length === invoicesData.invoices.length ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <input
                                type="checkbox"
                                checked={selectedInvoices.length === invoicesData.invoices.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedInvoices(invoicesData.invoices.map(inv => inv.id));
                                  } else {
                                    setSelectedInvoices([]);
                                  }
                                }}
                              />
                            </TableHead>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Line Items</TableHead>
                            <TableHead>Classifications</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoicesData.invoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedInvoices.includes(invoice.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedInvoices(prev => [...prev, invoice.id]);
                                    } else {
                                      setSelectedInvoices(prev => prev.filter(id => id !== invoice.id));
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {invoice.invoiceNumber}
                              </TableCell>
                              <TableCell>{invoice.vendorName}</TableCell>
                              <TableCell>
                                {invoice.currency} {invoice.totalAmount}
                              </TableCell>
                              <TableCell>
                                {new Date(invoice.invoiceDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{invoice.projectId}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  className={
                                    invoice.status === 'verified' ? 'bg-green-100 text-green-800' :
                                    invoice.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }
                                >
                                  {invoice.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  {invoice.lineItemsExtracted ? (
                                    <Badge className="bg-green-100 text-green-800">
                                      {invoice.lineItemsCount} items
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-gray-100 text-gray-800">
                                      OCR only
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {invoice.hasClassifications ? (
                                  <Badge className="bg-blue-100 text-blue-800">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Classified
                                  </Badge>
                                ) : (
                                  <Badge className="bg-orange-100 text-orange-800">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      No invoices found matching your criteria. Try adjusting the filters above.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Available Categories</CardTitle>
                <CardDescription>
                  Supported classification categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading categories...</span>
                  </div>
                ) : categories ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(categories).map(([category, description]: [string, string]) => (
                      <div key={category} className="border rounded p-3 space-y-2">
                        <Badge className={getCategoryColor(category)}>
                          {category.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      Unable to load categories. Please refresh the page.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {testMutation.data && (
              <Card>
                <CardHeader>
                  <CardTitle>Test Results</CardTitle>
                  <CardDescription>
                    Results from the most recent system test
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {testMutation.data.results.map((result: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {result.item.description}
                          </TableCell>
                          <TableCell>
                            <Badge className={getCategoryColor(result.classification.category)}>
                              {result.classification.category.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {(result.classification.confidence * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {getMethodIcon(result.classification.method)}
                              <span>{result.classification.method}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}