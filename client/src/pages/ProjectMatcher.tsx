import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Wrench, CheckCircle, AlertTriangle, Database } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface ProjectMatchResult {
  invoiceId: number;
  invoiceNumber: string;
  vendorName: string;
  projectId: string;
  projectName: string;
  matchScore: number;
  status: 'auto' | 'manual';
}

interface RepairResponse {
  message: string;
  processedCount: number;
  matchedCount: number;
  matches: ProjectMatchResult[];
}

export default function ProjectMatcher() {
  const [repairResults, setRepairResults] = useState<RepairResponse | null>(null);

  // Check current database state
  const { data: invoiceStats, isLoading: loadingStats } = useQuery({
    queryKey: ['/api/invoices/stats'],
    queryFn: async () => {
      const response = await fetch('/api/invoices/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  // Project matching repair mutation
  const repairMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/repair-project-matches', {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      setRepairResults(data);
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    }
  });

  const handleRepair = () => {
    setRepairResults(null);
    repairMutation.mutate();
  };

  if (loadingStats) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading system status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Project Matching Repair</h1>
        <p className="text-muted-foreground">
          Fix the broken data pipeline between Invoice Project Matching and Line Item Classification systems
        </p>
      </div>

      {/* System Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Current System Status
          </CardTitle>
          <CardDescription>
            Database state analysis for invoice processing pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {invoiceStats?.totalInvoices || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Invoices</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {invoiceStats?.totalProjects || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Projects</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {invoiceStats?.totalMatches || 0}
              </div>
              <div className="text-sm text-muted-foreground">Project Matches</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {invoiceStats?.unmatchedInvoices || 0}
              </div>
              <div className="text-sm text-muted-foreground">Unmatched</div>
            </div>
          </div>

          {invoiceStats?.totalMatches === 0 && invoiceStats?.totalInvoices > 0 && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Critical Issue Detected:</strong> You have {invoiceStats.totalInvoices} invoices 
                but 0 project matches. This breaks the line item classification pipeline.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Repair Action */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Repair Project Matches
          </CardTitle>
          <CardDescription>
            Execute AI-powered project matching to fix the broken data pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              This will:
              <ul className="list-disc ml-6 mt-2">
                <li>Analyze all existing invoices using AI-powered fuzzy matching</li>
                <li>Match invoices to projects based on vendor, address, and project names</li>
                <li>Create invoice_project_matches records for the classification system</li>
                <li>Enable the Line Item Classification workflow to function properly</li>
              </ul>
            </div>

            <Button 
              onClick={handleRepair} 
              disabled={repairMutation.isPending}
              className="w-full"
            >
              {repairMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Repairing Project Matches...
                </>
              ) : (
                <>
                  <Wrench className="mr-2 h-4 w-4" />
                  Repair Project Matches
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {repairMutation.error && (
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Repair Failed:</strong> {repairMutation.error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Results Display */}
      {repairResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Repair Results
            </CardTitle>
            <CardDescription>
              {repairResults.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {repairResults.processedCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Invoices Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {repairResults.matchedCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Successfully Matched</div>
                </div>
              </div>

              {repairResults.matches.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Project Matches Created:</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {repairResults.matches.map((match, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">
                            Invoice #{match.invoiceNumber}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {match.vendorName}
                          </div>
                        </div>
                        <div className="flex-1 text-center">
                          <div className="font-medium text-sm">
                            {match.projectName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {match.projectId}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={match.status === 'auto' ? 'default' : 'secondary'}>
                            {match.matchScore}% {match.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {repairResults.matchedCount > 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Success!</strong> The data pipeline has been repaired. 
                    Line Item Classification should now work properly.
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