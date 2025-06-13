import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, User, CheckCircle, AlertCircle, Search, Target } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ProjectMatch {
  project: {
    id: number;
    projectId: string;
    name: string;
    description?: string;
    address?: string;
    city?: string;
    supervisor?: string;
    budget?: string;
    currency?: string;
  };
  confidence: number;
  matchDetails: {
    nameMatch: number;
    addressMatch: number;
    vendorMatch: number;
    amountMatch: number;
    reasonings: string[];
  };
}

interface MatchingResult {
  matches: ProjectMatch[];
  autoMatch: ProjectMatch | null;
  recommendation: string;
  currentMatch?: {
    projectId: string;
    confidence: number;
    matchedBy: string;
    status: string;
  } | null;
}

export default function ProjectMatching() {
  const [match, params] = useRoute("/invoices/:id/match-project");
  const invoiceId = params?.id ? parseInt(params.id) : null;
  const [confidenceThreshold, setConfidenceThreshold] = useState([80]);
  const [isMatching, setIsMatching] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get invoice details
  const { data: invoice, isLoading: invoiceLoading } = useQuery<any>({
    queryKey: ['/api/invoices', invoiceId],
    enabled: !!invoiceId,
  });

  // Get matching results
  const { data: matchingResult, isLoading: matchingLoading, refetch: refetchMatching } = useQuery<MatchingResult>({
    queryKey: ['/api/invoices', invoiceId, 'match-project', confidenceThreshold[0]],
    queryFn: async () => {
      const response = await fetch(`/api/invoices/${invoiceId}/match-project?threshold=${confidenceThreshold[0]}`);
      if (!response.ok) {
        throw new Error('Failed to fetch matching results');
      }
      return response.json() as MatchingResult;
    },
    enabled: !!invoiceId,
  });

  // Update project match mutation
  const updateMatchMutation = useMutation({
    mutationFn: async ({ projectId, confidence, matchedBy, matchStatus }: {
      projectId?: string;
      confidence?: number;
      matchedBy: 'AI' | 'user';
      matchStatus: 'auto' | 'manual' | 'no_match';
    }) => {
      return apiRequest(`/api/invoices/${invoiceId}/match-project`, 'POST', { 
        projectId, 
        confidence, 
        matchedBy, 
        matchStatus 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      refetchMatching();
      toast({
        title: "Success",
        description: "Project match updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project match",
        variant: "destructive",
      });
    },
  });

  const handleAutoMatch = async () => {
    if (!matchingResult?.autoMatch) return;
    
    setIsMatching(true);
    await updateMatchMutation.mutateAsync({
      projectId: matchingResult.autoMatch.project.projectId,
      confidence: matchingResult.autoMatch.confidence,
      matchedBy: 'AI',
      matchStatus: 'auto',
    });
    setIsMatching(false);
  };

  const handleManualMatch = async (projectMatch: ProjectMatch) => {
    setIsMatching(true);
    await updateMatchMutation.mutateAsync({
      projectId: projectMatch.project.projectId,
      confidence: projectMatch.confidence,
      matchedBy: 'user',
      matchStatus: 'manual',
    });
    setIsMatching(false);
  };

  const handleClearMatch = async () => {
    setIsMatching(true);
    await updateMatchMutation.mutateAsync({
      matchedBy: 'user',
      matchStatus: 'no_match',
    });
    setIsMatching(false);
  };

  const extractInvoiceMetadata = (invoice: any) => ({
    projectName: invoice.projectName || invoice.extractedData?.project_name || 'Not specified',
    vendorName: invoice.vendorName || invoice.extractedData?.vendor_name || 'Not specified',
    address: invoice.extractedData?.address || 'Not specified',
    city: invoice.extractedData?.city || 'Not specified',
    totalAmount: invoice.totalAmount || 'Not specified',
    currency: invoice.currency || 'USD',
  });

  if (!match || !invoiceId) {
    return <div>Invoice not found</div>;
  }

  if (invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const metadata = invoice ? extractInvoiceMetadata(invoice) : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Matching</h1>
          <p className="text-muted-foreground">
            Match invoice to project using AI-powered analysis
          </p>
        </div>
        <Badge variant={matchingResult?.currentMatch ? "default" : "secondary"}>
          {matchingResult?.currentMatch ? "Matched" : "Unmatched"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Invoice Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Invoice Details
            </CardTitle>
            <CardDescription>
              Extracted metadata for project matching
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {metadata && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Project Name</label>
                  <p className="text-sm">{metadata.projectName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Vendor</label>
                  <p className="text-sm">{metadata.vendorName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Address</label>
                  <p className="text-sm">{metadata.address}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">City</label>
                  <p className="text-sm">{metadata.city}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Amount</label>
                  <p className="text-sm">{metadata.totalAmount} {metadata.currency}</p>
                </div>
              </div>
            )}

            {invoice?.fileName && (
              <div className="pt-2 border-t">
                <label className="text-sm font-medium text-muted-foreground">File</label>
                <p className="text-sm">{invoice.fileName}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel: Matching Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Project Matches
            </CardTitle>
            <CardDescription>
              AI-powered project matching results
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Confidence Threshold Control */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Auto-match Threshold: {confidenceThreshold[0]}%
              </label>
              <div className="relative">
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={confidenceThreshold[0]}
                  onChange={(e) => setConfidenceThreshold([parseInt(e.target.value)])}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Projects above this confidence will auto-match
              </p>
            </div>

            <Separator />

            {/* Current Match Status */}
            {matchingResult?.currentMatch && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Currently matched to project <strong>{matchingResult.currentMatch.projectId}</strong> 
                  with {matchingResult.currentMatch.confidence}% confidence
                  {matchingResult.currentMatch.matchedBy === 'AI' ? ' (Auto-matched)' : ' (Manual)'}
                </AlertDescription>
              </Alert>
            )}

            {/* Recommendation */}
            {matchingResult?.recommendation && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{matchingResult.recommendation}</AlertDescription>
              </Alert>
            )}

            {/* Auto-match Option */}
            {matchingResult?.autoMatch && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bot className="h-5 w-5 text-green-600" />
                    Auto-match Available
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h4 className="font-medium">{matchingResult.autoMatch.project.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {matchingResult.autoMatch.project.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Confidence:</span>
                    <Progress value={matchingResult.autoMatch.confidence} className="flex-1" />
                    <Badge variant="secondary">{matchingResult.autoMatch.confidence}%</Badge>
                  </div>
                  <Button 
                    onClick={handleAutoMatch} 
                    disabled={isMatching}
                    className="w-full"
                  >
                    {isMatching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Accept Auto-match
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Manual Matches */}
            {matchingResult?.matches && matchingResult.matches.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium">Manual Selection</h4>
                {matchingResult.matches.map((match, index) => (
                  <Card key={match.project.projectId} className="border-gray-200">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-medium">{match.project.name}</h5>
                            <p className="text-sm text-muted-foreground">
                              {match.project.description || 'No description'}
                            </p>
                            {match.project.city && (
                              <p className="text-xs text-muted-foreground">{match.project.city}</p>
                            )}
                          </div>
                          <Badge variant={index === 0 ? "default" : "secondary"}>
                            #{index + 1}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Confidence:</span>
                          <Progress value={match.confidence} className="flex-1" />
                          <Badge variant="outline">{match.confidence}%</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Name: {match.matchDetails.nameMatch}%</div>
                          <div>Location: {match.matchDetails.addressMatch}%</div>
                          <div>Vendor: {match.matchDetails.vendorMatch}%</div>
                          <div>Budget: {match.matchDetails.amountMatch}%</div>
                        </div>

                        <Button 
                          onClick={() => handleManualMatch(match)}
                          disabled={isMatching}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          {isMatching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          <User className="h-4 w-4 mr-2" />
                          Select This Project
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Clear Match Button */}
            {matchingResult?.currentMatch && (
              <Button 
                onClick={handleClearMatch}
                disabled={isMatching}
                variant="destructive"
                size="sm"
                className="w-full"
              >
                Clear Current Match
              </Button>
            )}

            {matchingLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Analyzing matches...</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}