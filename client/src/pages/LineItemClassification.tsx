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

interface Invoice {
  id: number;
  invoiceNumber: string | null;
  vendorName: string | null;
  totalAmount: string | null;
  status: string;
  createdAt: string;
  projectId: string | null;
}

interface ClassificationResult {
  invoiceId: number;
  invoiceNumber: string | null;
  vendorName: string | null;
  totalAmount: string | null;
  processedAt: string;
  lineItems: {
    description: string;
    category: string;
    amount: string;
    confidence: number;
  }[];
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
  const [currentTab, setCurrentTab] = useState("process"); // Default to 'process' tab

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

  // Placeholder states and functions for Process Invoices and Results tabs
  const [projectId, setProjectId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [classificationResults, setClassificationResults] = useState<ClassificationResult[]>([]);

  const refreshInvoices = () => {
    // Placeholder for API call to refresh invoices
    console.log("Refreshing invoices...");
  };

  const processSpecificInvoice = (id: number) => {
    // Placeholder for API call to process a specific invoice
    console.log(`Processing invoice ${id}...`);
    toast({ title: "Processing Invoice", description: `Initiated processing for invoice ${id}.` });
  };

  const processAllFiltered = () => {
    // Placeholder for API call to process all filtered invoices
    setProcessingLoading(true);
    console.log("Processing all filtered invoices...");
    setTimeout(() => {
      setProcessingLoading(false);
      toast({ title: "Processing Invoices", description: "All filtered invoices have been submitted for processing." });
    }, 2000);
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="process">Process Invoices</TabsTrigger>
            <TabsTrigger value="results">Results & History</TabsTrigger>
          </TabsList>

          {/* Vendor Context Card - Kept as it might be relevant for future functionality */}
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

          {/* Process Invoices Content */}
          <TabsContent value="process" className="space-y-6">
            <Card className="bg-white shadow-sm border border-gray-200">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-gray-900">Process Invoices for Line Item Classification</CardTitle>
                <p className="text-gray-600">Process invoices from the InvoiceProjectMatches table to automatically extract and classify their line items</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <Label htmlFor="project-id" className="text-sm font-medium text-gray-700">
                      Project ID
                    </Label>
                    <Input
                      id="project-id"
                      value={filterProjectId}
                      onChange={(e) => setFilterProjectId(e.target.value)}
                      placeholder="Enter project ID"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-from" className="text-sm font-medium text-gray-700">
                      Date From
                    </Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-to" className="text-sm font-medium text-gray-700">
                      Date To
                    </Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
                      Status
                    </Label>
                    <select
                      id="status-filter"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="extracted">Extracted</option>
                    </select>
                  </div>
                </div>

                <div className="flex space-x-4 mb-6">
                  <Button
                    onClick={() => refetchInvoices()}
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
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

                {invoicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading invoices...</span>
                  </div>
                ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={selectedInvoices.length === invoicesData.invoices.length && invoicesData.invoices.length > 0}
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