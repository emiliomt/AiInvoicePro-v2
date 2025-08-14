
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle, Clock, FileText, Zap, Filter, RefreshCw, Loader2, Play, XCircle } from "lucide-react";
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

interface ProgressSession {
  sessionId: string;
  userId: string;
  type: 'line-item-classification';
  status: 'initializing' | 'processing' | 'completed' | 'error';
  startTime: string;
  endTime?: string;
  currentStep: number;
  totalSteps: number;
  steps: ProgressStep[];
  metrics: {
    totalInvoices: number;
    processedInvoices: number;
    currentInvoice?: number;
    totalItems: number;
    processedItems: number;
    currentItem?: number;
    successRate: number;
    elapsedTime: number;
    estimatedRemaining: number;
  };
  results?: any[];
  error?: string;
  title?: string;
}

interface ProgressStep {
  step: string;
  description: string;
  icon: string;
  estimatedTime: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  startTime?: string;
  endTime?: string;
  error?: string;
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
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Enhanced progress state
  const [progressSession, setProgressSession] = useState<ProgressSession | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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

  // WebSocket connection for real-time progress updates
  useEffect(() => {
    if (!processingSessionId) return;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('📡 WebSocket connected for progress tracking');
          wsRef.current?.send(JSON.stringify({
            type: 'subscribe_progress',
            sessionId: processingSessionId
          }));
        };

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        wsRef.current.onclose = () => {
          console.log('📡 WebSocket disconnected');
          if (isProcessing) {
            setTimeout(connectWebSocket, 3000); // Reconnect if still processing
          }
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [processingSessionId, isProcessing]);

  const handleWebSocketMessage = (message: any) => {
    console.log('📨 WebSocket message:', message);

    switch (message.type) {
      case 'progress_update':
      case 'step_progress':
      case 'metrics_updated':
        setProgressSession(prev => ({
          ...prev,
          ...message.data,
        } as ProgressSession));
        break;

      case 'classification_finished':
        setProgressSession(prev => prev ? {
          ...prev,
          status: 'completed',
          endTime: new Date().toISOString(),
          results: message.data.results
        } : null);
        
        setIsProcessing(false);
        
        toast({
          title: "Processing Complete!",
          description: `Successfully processed classification`,
        });

        // Refresh data
        refetchInvoices();
        refetchResults();
        
        // Hide progress after 10 seconds
        setTimeout(() => {
          setProgressSession(null);
          setProcessingSessionId("");
        }, 10000);
        break;

      case 'classification_error':
        setProgressSession(prev => prev ? {
          ...prev,
          status: 'error',
          endTime: new Date().toISOString(),
          error: message.data.error
        } : null);
        
        setIsProcessing(false);
        
        toast({
          title: "Processing Error",
          description: message.data.error,
          variant: "destructive",
        });
        break;

      case 'progress_state':
        setProgressSession(message.data);
        break;
    }
  };

  const handleProcessSelected = async () => {
    if (selectedInvoices.length === 0) {
      toast({
        title: "No invoices selected",
        description: "Please select at least one invoice to process.",
        variant: "destructive",
      });
      return;
    }

    const sessionId = `bulk-classify-${Date.now()}`;
    setProcessingSessionId(sessionId);
    setIsProcessing(true);

    // Initialize progress session
    setProgressSession({
      sessionId,
      userId: 'current-user',
      type: 'line-item-classification',
      status: 'initializing',
      startTime: new Date().toISOString(),
      currentStep: 0,
      totalSteps: 6,
      steps: [
        { step: "Initializing Classification", description: "Setting up classification parameters", icon: "⚙️", estimatedTime: "2-3 seconds", status: 'active' },
        { step: "Extracting Line Items", description: "Parsing invoice data", icon: "📋", estimatedTime: "5-10 seconds per invoice", status: 'pending' },
        { step: "Loading Classification Keywords", description: "Retrieving keyword categories", icon: "🔑", estimatedTime: "1-2 seconds", status: 'pending' },
        { step: "Classifying Line Items", description: "Applying AI classification", icon: "🤖", estimatedTime: "3-5 seconds per item", status: 'pending' },
        { step: "Saving Results", description: "Storing classification results", icon: "💾", estimatedTime: "2-3 seconds", status: 'pending' },
        { step: "Processing Complete", description: "Classification completed", icon: "✅", estimatedTime: "Complete", status: 'pending' }
      ],
      metrics: {
        totalInvoices: selectedInvoices.length,
        processedInvoices: 0,
        totalItems: 0,
        processedItems: 0,
        successRate: 0,
        elapsedTime: 0,
        estimatedRemaining: 0
      },
      title: `Line Item Classification - ${selectedInvoices.length} invoices`
    });

    try {
      const response = await fetch('/api/process-invoices-line-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          invoiceIds: selectedInvoices,
          sessionId,
          vendorContext: {
            vendorName: '',
            industry: '',
            businessType: ''
          }
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to start processing');
      }

      toast({
        title: "Processing Started",
        description: "Bulk classification has begun. Track progress below.",
      });

    } catch (error) {
      console.error('Processing error:', error);
      setProgressSession(prev => prev ? {
        ...prev,
        status: 'error',
        endTime: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      } : null);
      
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
      
      setIsProcessing(false);
    }
  };

  const invoices = invoiceData?.invoices || [];
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

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStepIcon = (step: ProgressStep) => {
    if (step.status === 'completed') return '✅';
    if (step.status === 'error') return '❌';
    if (step.status === 'active') return '⏳';
    return step.icon;
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

      {/* Enhanced Progress Display */}
      {progressSession && (
        <Card className={`border-2 ${
          progressSession.status === 'completed' ? 'border-green-500 bg-green-50' :
          progressSession.status === 'error' ? 'border-red-500 bg-red-50' :
          'border-blue-500 bg-blue-50'
        }`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {progressSession.status === 'processing' && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                {progressSession.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
                {progressSession.status === 'error' && <XCircle className="h-5 w-5 text-red-600" />}
                {progressSession.title}
                <Badge variant="outline" className="text-xs">
                  {progressSession.sessionId}
                </Badge>
              </CardTitle>
              
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4" />
                {formatDuration(progressSession.metrics.elapsedTime)}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress: {progressSession.metrics.processedInvoices} / {progressSession.metrics.totalInvoices} invoices</span>
                <span>{Math.round((progressSession.metrics.processedInvoices / progressSession.metrics.totalInvoices) * 100)}%</span>
              </div>
              <Progress 
                value={(progressSession.metrics.processedInvoices / progressSession.metrics.totalInvoices) * 100} 
                className="h-3" 
              />
            </div>

            {/* Step Progress */}
            <div className="space-y-3">
              <div className="text-sm font-medium">Processing Steps:</div>
              <div className="grid gap-2">
                {progressSession.steps.map((step, index) => (
                  <div key={index} className={`flex items-center gap-3 p-2 rounded-lg ${
                    step.status === 'active' ? 'bg-blue-100' :
                    step.status === 'completed' ? 'bg-green-100' :
                    step.status === 'error' ? 'bg-red-100' :
                    'bg-gray-50'
                  }`}>
                    <span className="text-lg">{getStepIcon(step)}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{step.step}</div>
                      <div className="text-xs text-gray-600">{step.description}</div>
                    </div>
                    <div className="text-xs text-gray-500">{step.estimatedTime}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics */}
            {progressSession.metrics.totalItems > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-white rounded-lg">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{progressSession.metrics.processedItems}</div>
                  <div className="text-xs text-gray-600">Items Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{Math.round(progressSession.metrics.successRate)}%</div>
                  <div className="text-xs text-gray-600">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">{formatDuration(progressSession.metrics.estimatedRemaining)}</div>
                  <div className="text-xs text-gray-600">Est. Remaining</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-600">{progressSession.metrics.totalItems}</div>
                  <div className="text-xs text-gray-600">Total Items</div>
                </div>
              </div>
            )}

            {/* Results Summary */}
            {progressSession.status === 'completed' && progressSession.results && (
              <div className="p-3 bg-green-100 rounded-lg">
                <div className="text-sm font-medium text-green-800 mb-2">
                  ✅ Processing completed successfully!
                </div>
                <div className="text-xs text-green-700">
                  Total Results: {progressSession.results.length} items processed
                </div>
              </div>
            )}

            {/* Error Display */}
            {progressSession.status === 'error' && progressSession.error && (
              <div className="p-3 bg-red-100 rounded-lg">
                <div className="text-sm font-medium text-red-800 mb-1">Processing Error:</div>
                <div className="text-xs text-red-700">{progressSession.error}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  onClick={handleProcessSelected}
                  disabled={selectedInvoices.length === 0 || isProcessing}
                  className="flex items-center"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Start Classification
                    </>
                  )}
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
