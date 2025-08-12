import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, XCircle, Search, DollarSign, FileText, Settings, Zap } from "lucide-react";

interface RejectionDetails {
  invoiceId: number;
  vendorName: string;
  invoiceNumber: string;
  totalAmount: string;
  currency: string;
  fileName: string;
  rejectionReason: string;
  validationPassed: boolean;
  validationScore: number;
  validationErrors: Array<{
    ruleId: number;
    fieldName: string;
    severity: string;
    message: string;
  }>;
  projectMatchScore: number;
  projectMatchesFound: number;
  availableProjects: Array<{ id: number; name: string }>;
  extractionIssues: string[];
  extractionConfidence: number;
  thresholdCheck: {
    originalAmount: number;
    originalCurrency: string;
    convertedAmountUSD: number;
    threshold: number;
    passesThreshold: boolean;
    conversionRate: number;
  };
  timestamp: string;
  processingStatus: string;
}

export default function InvoiceRejectionDebugger() {
  const [invoiceId, setInvoiceId] = useState("4101060"); // Default to the problematic invoice
  const [debugData, setDebugData] = useState<RejectionDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeRejection = async () => {
    if (!invoiceId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/rejection-details`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to analyze invoice: ${response.statusText}`);
      }
      
      const data = await response.json();
      setDebugData(data);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze invoice rejection');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getRejectionReasonIcon = (reason: string) => {
    switch (reason) {
      case 'validation_failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'project_match_failed':
        return <Settings className="h-4 w-4 text-orange-500" />;
      case 'extraction_failed':
        return <FileText className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Invoice Rejection Debugger</h1>
          <p className="text-muted-foreground">
            Investigate and analyze why invoices are being rejected in automatic processing
          </p>
        </div>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Analyze Invoice Rejection
          </CardTitle>
          <CardDescription>
            Enter an invoice ID to get detailed rejection analysis (e.g., Invoice #4101060)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter Invoice ID (e.g., 4101060)"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={analyzeRejection} 
              disabled={loading || !invoiceId}
              className="flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              {loading ? 'Analyzing...' : 'Analyze'}
            </Button>
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results Section */}
      {debugData && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Invoice Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Invoice Overview</span>
                <Badge variant={debugData.validationPassed ? "default" : "destructive"}>
                  {debugData.validationPassed ? "Valid" : "Rejected"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <span className="font-medium">Invoice ID:</span>
                  <span>#{debugData.invoiceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Vendor:</span>
                  <span className="text-right">{debugData.vendorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Invoice Number:</span>
                  <span>{debugData.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Amount:</span>
                  <span className="font-mono">
                    {debugData.currency} {debugData.totalAmount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">File:</span>
                  <span className="text-right text-sm">{debugData.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Status:</span>
                  <span>{debugData.processingStatus}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rejection Reason */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getRejectionReasonIcon(debugData.rejectionReason)}
                Primary Rejection Reason
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Reason:</span>
                  <Badge variant="outline">
                    {debugData.rejectionReason.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="text-sm text-muted-foreground">
                  {debugData.rejectionReason === 'validation_failed' && (
                    "Invoice failed validation rules. Check validation details below."
                  )}
                  {debugData.rejectionReason === 'project_match_failed' && (
                    "No matching projects found for this vendor. Project matching is required for auto-approval."
                  )}
                  {debugData.rejectionReason === 'extraction_failed' && (
                    "Data extraction issues detected. Required fields may be missing or invalid."
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Validation Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {debugData.validationPassed ? 
                  <CheckCircle className="h-5 w-5 text-green-500" /> : 
                  <XCircle className="h-5 w-5 text-red-500" />
                }
                Validation Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="font-medium">Validation Score:</span>
                <span className="font-mono">
                  {(debugData.validationScore * 100).toFixed(1)}%
                </span>
              </div>
              
              {debugData.validationErrors && debugData.validationErrors.length > 0 && (
                <div className="space-y-2">
                  <span className="font-medium">Validation Errors:</span>
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {debugData.validationErrors.map((error, index) => (
                        <div key={index} className="p-2 border rounded text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{error.fieldName}</span>
                            <Badge variant={getSeverityColor(error.severity) as any}>
                              {error.severity}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground">{error.message}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Matching */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Project Matching Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="font-medium">Match Score:</span>
                <span className="font-mono">{debugData.projectMatchScore}%</span>
              </div>
              
              <div className="flex justify-between">
                <span className="font-medium">Projects Found:</span>
                <span>{debugData.projectMatchesFound}</span>
              </div>

              {debugData.availableProjects && debugData.availableProjects.length > 0 && (
                <div className="space-y-2">
                  <span className="font-medium">Available Projects:</span>
                  <ScrollArea className="h-20">
                    <div className="space-y-1">
                      {debugData.availableProjects.map((project, index) => (
                        <div key={index} className="text-sm p-2 border rounded">
                          <span className="font-medium">#{project.id}</span> - {project.name}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {debugData.projectMatchesFound === 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No projects match "PANAMERICANA OUTSOURCING". Consider adding this vendor to project associations.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Petty Cash Threshold */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Petty Cash Threshold Check
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Original Amount:</span>
                  <span className="font-mono">
                    {debugData.thresholdCheck.originalCurrency} {debugData.thresholdCheck.originalAmount.toLocaleString()}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium">USD Equivalent:</span>
                  <span className="font-mono">
                    ${debugData.thresholdCheck.convertedAmountUSD.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium">Threshold:</span>
                  <span className="font-mono">
                    ${debugData.thresholdCheck.threshold.toLocaleString()}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium">Passes Threshold:</span>
                  <Badge variant={debugData.thresholdCheck.passesThreshold ? "default" : "destructive"}>
                    {debugData.thresholdCheck.passesThreshold ? "Yes" : "No"}
                  </Badge>
                </div>
                
                {debugData.thresholdCheck.originalCurrency === 'COP' && (
                  <div className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded">
                    Using conversion rate: 1 USD = {debugData.thresholdCheck.conversionRate} COP
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Data Extraction Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Data Extraction Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="font-medium">Extraction Confidence:</span>
                <span className="font-mono">
                  {(debugData.extractionConfidence * 100).toFixed(1)}%
                </span>
              </div>

              {debugData.extractionIssues && debugData.extractionIssues.length > 0 ? (
                <div className="space-y-2">
                  <span className="font-medium">Issues Found:</span>
                  <div className="space-y-1">
                    {debugData.extractionIssues.map((issue, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>No extraction issues detected</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recommendations */}
      {debugData && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Actions</CardTitle>
            <CardDescription>
              Based on the analysis, here are suggested steps to resolve the rejection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {debugData.rejectionReason === 'validation_failed' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Fix Validation Errors:</strong> Review and adjust validation rules or fix the invoice data issues listed above.
                  </AlertDescription>
                </Alert>
              )}
              
              {debugData.rejectionReason === 'project_match_failed' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Add Project Association:</strong> Create a project entry for "PANAMERICANA OUTSOURCING S.A." or improve the project matching algorithm.
                  </AlertDescription>
                </Alert>
              )}
              
              {debugData.rejectionReason === 'extraction_failed' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Improve Data Extraction:</strong> Check OCR/AI extraction settings or manually verify the invoice format.
                  </AlertDescription>
                </Alert>
              )}
              
              {debugData.thresholdCheck.passesThreshold && debugData.projectMatchesFound === 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Good News:</strong> Amount ({debugData.thresholdCheck.convertedAmountUSD.toFixed(2)} USD) is well under the petty cash threshold. Main issue is project matching.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}