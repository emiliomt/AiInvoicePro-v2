import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle, Clock, FileText, Zap, Filter, Download, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface InvoiceForClassification {
  invoiceId: number;
  projectId?: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  lineItemsCount: number;
  classificationsCount: number;
  ocrText?: string;
}

interface ClassificationProgress {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  totalInvoices: number;
  processedInvoices: number;
  totalLineItems: number;
  classifiedLineItems: number;
  currentInvoice?: string;
  startTime: string;
  estimatedCompletion?: string;
  errors: string[];
  results: {
    invoiceId: number;
    vendorName: string;
    projectId?: string;
    lineItemsCount: number;
    classificationsCount: number;
    status: 'success' | 'failed';
  }[];
  summary: {
    successfulInvoices: number;
    failedInvoices: number;
    totalClassifications: number;
    averageConfidence: number;
    categoryBreakdown: Record<string, number>;
  };
}

interface ClassificationResult {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  vendorName: string;
  projectId?: string;
  lineItemDescription: string;
  category: string;
  subcategory?: string;
  confidence: string;
  method: string;
  reasoning?: string;
  matchedKeywords?: string[];
  classifiedAt: string;
  isUserVerified: boolean;
}

export default function BulkClassificationPage() {
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [filterProjectId, setFilterProjectId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [processingSessionId, setProcessingSessionId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [resultsPage, setResultsPage] = useState(1);
  
  const queryClient = useQueryClient();

  // Get invoices ready for classification
  const { data: invoiceData, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<{
    invoices: InvoiceForClassification[];
    count: number;
  }>({
    queryKey: ['/api/invoices/ready-for-classification', { filterProjectId, dateFrom, dateTo }],
    queryFn: async () => {
      const response = await apiRequest({
        url: '/api/invoices/ready-for-classification',
        method: 'GET',
        params: {
          projectId: filterProjectId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }
      });
      return response as unknown as { invoices: InvoiceForClassification[]; count: number };
    },
    enabled: true,
  });

  // Get classification progress
  const { data: progressData, isLoading: progressLoading } = useQuery<ClassificationProgress>({
    queryKey: ['/api/classify-bulk-invoices/progress', { processingSessionId }],
    queryFn: async () => {
      const response = await apiRequest({
        url: `/api/classify-bulk-invoices/progress/${processingSessionId || 'default'}`,
        method: 'GET',
      });
      return response as unknown as ClassificationProgress;
    },
    enabled: !!processingSessionId,
    refetchInterval: processingSessionId ? 2000 : false, // Poll every 2 seconds during processing
  });

  // Get classification results
  const { data: resultsData, isLoading: resultsLoading, refetch: refetchResults } = useQuery<{
    results: ClassificationResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>({
    queryKey: ['/api/classification-results', { resultsPage, filterProjectId, dateFrom, dateTo }],
    queryFn: async () => {
      const response = await apiRequest({
        url: '/api/classification-results',
        method: 'GET',
        params: {
          page: resultsPage,
          limit: 50,
          projectId: filterProjectId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }
      });
      return response as unknown as {
        results: ClassificationResult[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      };
    },
  });

  // Get classification summary
  const { data: summaryData } = useQuery<{
    totalClassifications: number;
    categoryBreakdown: Record<string, number>;
    averageConfidence: number;
  }>({
    queryKey: ['/api/classification-summary', {}],
    queryFn: async () => {
      const response = await apiRequest({
        url: '/api/classification-summary',
        method: 'GET',
      });
      return response as unknown as {
        totalClassifications: number;
        categoryBreakdown: Record<string, number>;
        averageConfidence: number;
      };
    },
  });

  // Get available categories
  const { data: categoriesData } = useQuery<Record<string, string>>({
    queryKey: ['/api/classification/categories', {}],
    queryFn: async () => {
      const response = await apiRequest({
        url: '/api/classification/categories',
        method: 'GET',
      });
      return response as unknown as Record<string, string>;
    },
  });

  // Start bulk classification mutation
  const startClassificationMutation = useMutation({
    mutationFn: async (data: {
      invoiceIds: number[];
      filters?: { projectId?: string; dateFrom?: string; dateTo?: string };
      options?: { reclassifyExisting?: boolean; maxConcurrency?: number };
    }) => {
      const response = await apiRequest({
        url: '/api/classify-bulk-invoices',
        method: 'POST',
        data,
        headers: {
          'x-session-id': Date.now().toString(),
        }
      });
      return response as unknown as { sessionId: string; message: string; status: string };
    },
    onSuccess: (response) => {
      setProcessingSessionId(response.sessionId);
      toast({
        title: "Classification Started",
        description: "Bulk classification process has begun. You can track progress below.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Starting Classification",
        description: error.message || "Failed to start bulk classification",
        variant: "destructive",
      });
    }
  });

  const invoices = invoiceData?.invoices || [];
  const progress = progressData;
  const results = resultsData?.results || [];
  const summary = summaryData || { totalClassifications: 0, categoryBreakdown: {}, averageConfidence: 0 };
  const categories = categoriesData || {};

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(invoices.map((inv: InvoiceForClassification) => inv.invoiceId));
    } else {
      setSelectedInvoices([]);
    }
  };

  const handleInvoiceSelect = (invoiceId: number, checked: boolean) => {
    if (checked) {
      setSelectedInvoices(prev => [...prev, invoiceId]);
    } else {
      setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
    }
  };

  const handleStartClassification = () => {
    if (selectedInvoices.length === 0) {
      toast({
        title: "No Invoices Selected",
        description: "Please select at least one invoice to classify.",
        variant: "destructive",
      });
      return;
    }

    startClassificationMutation.mutate({
      invoiceIds: selectedInvoices,
      filters: {
        projectId: filterProjectId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
      options: {
        reclassifyExisting: true,
        maxConcurrency: 3,
      }
    });
  };

  const getProgressPercentage = () => {
    if (!progress || progress.totalInvoices === 0) return 0;
    return Math.round((progress.processedInvoices / progress.totalInvoices) * 100);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bulk Invoice Classification</h1>
          <p className="text-muted-foreground mt-2">
            Process multiple invoices for AI-powered line item classification
          </p>
        </div>
        <Button onClick={() => refetchInvoices()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="classify" className="space-y-4">
        <TabsList>
          <TabsTrigger value="classify">Classify Invoices</TabsTrigger>
          <TabsTrigger value="results">Classification Results</TabsTrigger>
          <TabsTrigger value="summary">Summary & Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="classify" className="space-y-6">
          {/* Filters Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Filter className="w-5 h-5 mr-2" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="projectId">Project ID</Label>
                <Input
                  id="projectId"
                  placeholder="Enter project ID"
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateFrom">Date From</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">Date To</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Progress Section */}
          {progress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  {getStatusIcon(progress.status)}
                  <span className="ml-2">Classification Progress</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{getProgressPercentage()}%</span>
                  </div>
                  <Progress value={getProgressPercentage()} className="w-full" />
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Invoices</div>
                    <div className="text-muted-foreground">
                      {progress.processedInvoices} / {progress.totalInvoices}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">Line Items</div>
                    <div className="text-muted-foreground">
                      {progress.classifiedLineItems} / {progress.totalLineItems}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">Status</div>
                    <Badge variant={progress.status === 'completed' ? 'default' : 'secondary'}>
                      {progress.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="font-medium">Avg. Confidence</div>
                    <div className="text-muted-foreground">
                      {Math.round(progress.summary.averageConfidence * 100)}%
                    </div>
                  </div>
                </div>

                {progress.currentInvoice && (
                  <div className="text-sm text-muted-foreground">
                    Currently processing: {progress.currentInvoice}
                  </div>
                )}

                {progress.errors.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-red-600">Errors:</div>
                    <ScrollArea className="h-20">
                      {progress.errors.map((error, index) => (
                        <div key={index} className="text-sm text-red-600">
                          {error}
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Invoice Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Invoices Ready for Classification ({invoices.length})</span>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label className="text-sm">Select All</Label>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Select</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Project ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Line Items</TableHead>
                        <TableHead>Classified</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice: InvoiceForClassification) => (
                        <TableRow key={invoice.invoiceId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedInvoices.includes(invoice.invoiceId)}
                              onCheckedChange={(checked) => 
                                handleInvoiceSelect(invoice.invoiceId, checked as boolean)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {invoice.invoiceNumber}
                          </TableCell>
                          <TableCell>{invoice.vendorName}</TableCell>
                          <TableCell>{invoice.projectId || 'N/A'}</TableCell>
                          <TableCell>
                            {new Date(invoice.invoiceDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>${invoice.totalAmount?.toLocaleString()}</TableCell>
                          <TableCell>{invoice.lineItemsCount}</TableCell>
                          <TableCell>{invoice.classificationsCount}</TableCell>
                          <TableCell>
                            {invoice.classificationsCount >= invoice.lineItemsCount ? (
                              <Badge variant="default">Complete</Badge>
                            ) : invoice.classificationsCount > 0 ? (
                              <Badge variant="secondary">Partial</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
              
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  {selectedInvoices.length} of {invoices.length} invoices selected
                </div>
                <Button 
                  onClick={handleStartClassification}
                  disabled={selectedInvoices.length === 0 || startClassificationMutation.isPending}
                  className="flex items-center"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {startClassificationMutation.isPending ? "Starting..." : "Start Classification"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Classification Results</CardTitle>
            </CardHeader>
            <CardContent>
              {resultsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Line Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Verified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result: ClassificationResult) => (
                        <TableRow key={result.id}>
                          <TableCell className="font-medium">
                            {result.invoiceNumber}
                          </TableCell>
                          <TableCell>{result.vendorName}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {result.lineItemDescription}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{result.category}</Badge>
                          </TableCell>
                          <TableCell>
                            {Math.round(parseFloat(result.confidence) * 100)}%
                          </TableCell>
                          <TableCell>
                            <Badge variant={result.method === 'ai' ? 'default' : 'secondary'}>
                              {result.method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(result.classifiedAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {result.isUserVerified ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-gray-400" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
              
              {resultsData?.pagination && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(resultsData.pagination.page - 1) * resultsData.pagination.limit + 1} to{' '}
                    {Math.min(resultsData.pagination.page * resultsData.pagination.limit, resultsData.pagination.total)}{' '}
                    of {resultsData.pagination.total} results
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResultsPage(prev => Math.max(1, prev - 1))}
                      disabled={resultsPage <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResultsPage(prev => prev + 1)}
                      disabled={resultsPage >= resultsData.pagination.pages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Total Classifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.totalClassifications}</div>
                <div className="text-sm text-muted-foreground">
                  Avg. Confidence: {Math.round(summary.averageConfidence * 100)}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(summary.categoryBreakdown).map(([category, count]) => (
                  <div key={category} className="flex justify-between">
                    <span className="text-sm">{categories[category] || category}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Available Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(categories).map(([key, description]) => (
                  <div key={key} className="space-y-1">
                    <Badge variant="outline">{key}</Badge>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}