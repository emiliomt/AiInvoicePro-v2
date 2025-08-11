import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ProcessingResult {
  invoiceId: number;
  status: 'success' | 'failed' | 'skipped';
  processingMode: 'automatic' | 'manual';
  error?: string;
}

interface ProcessingResponse {
  message: string;
  summary: {
    totalInvoices: number;
    successful: number;
    failed: number;
    processingMode: string;
    errors?: string[];
  };
  results: ProcessingResult[];
}

export default function AutomaticProcessing() {
  const [invoiceIds, setInvoiceIds] = useState('');
  const [processingMode, setProcessingMode] = useState<'automatic' | 'manual'>('automatic');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available invoices
  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['/api/invoices'],
    enabled: true,
  });

  // Processing mutation
  const processingMutation = useMutation({
    mutationFn: async (data: { invoiceIds: number[], processingMode: 'automatic' | 'manual' }) => {
      const response = await fetch('/api/invoices/initiate-automatic-process', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result as ProcessingResponse;
    },
    onSuccess: (data) => {
      toast({
        title: 'Processing Initiated',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Processing Failed',
        description: error.message || 'Failed to initiate processing',
        variant: 'destructive',
      });
    },
  });

  const handleProcessing = () => {
    if (!invoiceIds.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter invoice IDs',
        variant: 'destructive',
      });
      return;
    }

    const ids = invoiceIds
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));

    if (ids.length === 0) {
      toast({
        title: 'Error',
        description: 'Please enter valid invoice IDs (numbers separated by commas)',
        variant: 'destructive',
      });
      return;
    }

    processingMutation.mutate({
      invoiceIds: ids,
      processingMode,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Automatic Invoice Processing</h1>
        <Badge variant="outline" className="text-lg px-3 py-1">
          Auto-Processing System
        </Badge>
      </div>

      {/* Processing Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configure Automatic Processing</CardTitle>
          <CardDescription>
            Configure and initiate automatic invoice processing. The system will handle OCR, data extraction, 
            petty cash classification, project matching, and validation automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="processing-mode">Processing Mode</Label>
              <Select value={processingMode} onValueChange={(value: 'automatic' | 'manual') => setProcessingMode(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select processing mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">
                    🤖 Automatic (No Manual Approval)
                  </SelectItem>
                  <SelectItem value="manual">
                    👤 Manual (Traditional Workflow)
                  </SelectItem>
                </SelectContent>
              </Select>
              {processingMode === 'automatic' && (
                <p className="text-sm text-muted-foreground">
                  ✨ Fully automated processing with confidence-based approvals
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-ids">Invoice IDs</Label>
              <Input
                id="invoice-ids"
                placeholder="1, 2, 3, 4 (comma-separated)"
                value={invoiceIds}
                onChange={(e) => setInvoiceIds(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Enter the IDs of invoices to process (separated by commas)
              </p>
            </div>
          </div>

          <Button 
            onClick={handleProcessing}
            disabled={processingMutation.isPending}
            className="w-full"
            size="lg"
          >
            {processingMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>🚀 Start {processingMode === 'automatic' ? 'Automatic' : 'Manual'} Processing</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Automatic Processing Features */}
      <Card>
        <CardHeader>
          <CardTitle>Automatic Processing Features</CardTitle>
          <CardDescription>
            What happens during automatic processing mode
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">1</span>
                </div>
                <h3 className="font-semibold">OCR & Extraction</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatic text extraction and AI-powered data structuring with immediate save
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">2</span>
                </div>
                <h3 className="font-semibold">Petty Cash Auto-Approval</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatic approval for invoices under $400,000 USD threshold with 95% confidence
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">3</span>
                </div>
                <h3 className="font-semibold">Project Matching</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Auto-approve project matches with 80%+ confidence based on vendor and amount patterns
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">4</span>
                </div>
                <h3 className="font-semibold">Validation Auto-Approval</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Auto-approve validation with 85%+ score, flag lower scores for manual review
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Results */}
      {processingMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
            <CardDescription>
              Summary of the latest processing operation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {processingMutation.data.summary.totalInvoices}
                </div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {processingMutation.data.summary.successful}
                </div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {processingMutation.data.summary.failed}
                </div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <Badge variant="secondary">
                  {processingMutation.data.summary.processingMode}
                </Badge>
                <div className="text-sm text-muted-foreground">Mode</div>
              </div>
            </div>

            {processingMutation.data.results.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Individual Results:</h4>
                {processingMutation.data.results.map((result, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                    <Badge variant={
                      result.status === 'success' ? 'default' : 
                      result.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                      {result.status}
                    </Badge>
                    <span>Invoice {result.invoiceId}</span>
                    {result.error && (
                      <span className="text-sm text-red-600">- {result.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {processingMutation.data.summary.errors && processingMutation.data.summary.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="font-semibold text-red-600">Errors:</h4>
                {processingMutation.data.summary.errors.map((error, index) => (
                  <div key={index} className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
                    {error}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Available Invoices</CardTitle>
          <CardDescription>
            Invoices that can be processed automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <div>Loading invoices...</div>
          ) : invoices && Array.isArray(invoices) && invoices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {invoices.slice(0, 12).map((invoice: any) => (
                <div key={invoice.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">Invoice #{invoice.id}</div>
                      <div className="text-sm text-muted-foreground">
                        {invoice.vendorName || 'Unknown Vendor'}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {invoice.status}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <div>Amount: {invoice.totalAmount ? `$${invoice.totalAmount}` : 'N/A'}</div>
                    <div>File: {invoice.fileName}</div>
                    <div>Mode: {invoice.processingMode || 'manual'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No invoices available for processing
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}