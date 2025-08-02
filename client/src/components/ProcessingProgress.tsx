import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

interface ProcessingResult {
  invoiceId: number;
  invoiceNumber?: string;
  success: boolean;
  message?: string;
  error?: string;
}

interface ProcessingProgressProps {
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  totalInvoices: number;
  processedInvoices: number;
  results: ProcessingResult[];
}

export default function ProcessingProgress({
  isProcessing,
  currentStep,
  progress,
  totalInvoices,
  processedInvoices,
  results
}: ProcessingProgressProps) {
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  if (!isProcessing && results.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing Invoices
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-green-600" />
              Processing Complete
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{currentStep}</span>
              <span>{processedInvoices} of {totalInvoices}</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700">
              <CheckCircle className="h-3 w-3 mr-1" />
              {successCount} Successful
            </Badge>
          </div>
          {failureCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-red-50 text-red-700">
                <XCircle className="h-3 w-3 mr-1" />
                {failureCount} Failed
              </Badge>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-900">Processing Results:</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded text-sm ${
                    result.success
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <span>
                      Invoice {result.invoiceNumber || result.invoiceId}
                    </span>
                  </div>
                  <span className="text-xs">
                    {result.success ? result.message : result.error}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}