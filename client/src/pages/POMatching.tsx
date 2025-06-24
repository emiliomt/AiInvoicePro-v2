
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Target, AlertTriangle, CheckCircle, XCircle, TrendingUp, FileText, Eye, Download, Play, Zap } from "lucide-react";

interface InvoicePOMatch {
  id: number;
  invoiceId: number;
  poId: number;
  matchScore: string;
  matchDetails: any;
  status: string;
  createdAt: string;
  invoice: {
    id: number;
    fileName: string;
    vendorName: string;
    totalAmount: string;
    currency: string;
    invoiceDate: string;
    status: string;
  };
  purchaseOrder: {
    id: number;
    poId: string;
    vendorName: string;
    amount: string;
    currency: string;
    issueDate: string;
    projectId: string;
    status: string;
  };
}

export default function POMatching() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch invoice-PO matches
  const { data: invoicePoMatches = [], isLoading } = useQuery<InvoicePOMatch[]>({
    queryKey: ["/api/invoice-po-matches"],
  });

  // Start AI matching mutation
  const startMatchingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/match-invoices-to-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to start AI matching");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-po-matches"] });
      toast({
        title: "AI Matching Complete",
        description: `Processed ${data.totalProcessed} invoices, found ${data.totalMatched} matches`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start AI matching process",
        variant: "destructive",
      });
    },
  });

  // Approve match mutation
  const approveMatchMutation = useMutation({
    mutationFn: async (matchId: number) => {
      const response = await fetch(`/api/invoice-po-matches/${matchId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to approve match");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-po-matches"] });
      toast({
        title: "Success",
        description: "Match approved successfully",
      });
    },
  });

  // Reject match mutation
  const rejectMatchMutation = useMutation({
    mutationFn: async (matchId: number) => {
      const response = await fetch(`/api/invoice-po-matches/${matchId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to reject match");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-po-matches"] });
      toast({
        title: "Success",
        description: "Match rejected successfully",
      });
    },
  });

  const getMatchScoreBadge = (score: string) => {
    const numericScore = parseFloat(score);
    if (numericScore >= 90) {
      return <Badge className="bg-green-100 text-green-800">High Confidence</Badge>;
    } else if (numericScore >= 70) {
      return <Badge className="bg-yellow-100 text-yellow-800">Medium Confidence</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Low Confidence</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'auto':
        return <Badge variant="secondary">Auto Matched</Badge>;
      case 'manual':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'unresolved':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div>Loading invoice-PO matches...</div>
        </div>
      </div>
    );
  }

  const approvedMatches = invoicePoMatches.filter(m => m.status === 'manual');
  const pendingMatches = invoicePoMatches.filter(m => m.status === 'auto');
  const rejectedMatches = invoicePoMatches.filter(m => m.status === 'unresolved');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI-Powered Invoice-PO Matching</h1>
              <p className="text-gray-600 mt-2">
                Match verified invoices with purchase orders using AI analysis
              </p>
            </div>
            <Button
              onClick={() => startMatchingMutation.mutate()}
              disabled={startMatchingMutation.isPending}
              className="flex items-center space-x-2"
            >
              {startMatchingMutation.isPending ? (
                <TrendingUp className="animate-spin" size={16} />
              ) : (
                <Zap size={16} />
              )}
              <span>
                {startMatchingMutation.isPending ? "Matching..." : "Start AI Matching"}
              </span>
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Matches</p>
                  <p className="text-3xl font-bold text-blue-600">{invoicePoMatches.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Target className="text-blue-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{approvedMatches.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Review</p>
                  <p className="text-3xl font-bold text-yellow-600">{pendingMatches.length}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="text-yellow-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Rejected</p>
                  <p className="text-3xl font-bold text-red-600">{rejectedMatches.length}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="text-red-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice-PO Matches */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="text-purple-600" size={20} />
              <span>Invoice-Purchase Order Matches</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoicePoMatches.length > 0 ? (
              <div className="space-y-6">
                {invoicePoMatches.map((match) => (
                  <div key={match.id} className="border rounded-lg p-6 space-y-4">
                    {/* Invoice and PO Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Invoice Details */}
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <FileText className="text-blue-600" size={16} />
                          <h4 className="font-medium text-blue-900">Invoice</h4>
                        </div>
                        <div className="text-sm space-y-1">
                          <p><span className="font-medium">ID:</span> {match.invoice.id}</p>
                          <p><span className="font-medium">Vendor:</span> {match.invoice.vendorName || "Unknown"}</p>
                          <p><span className="font-medium">Amount:</span> {match.invoice.currency} {parseFloat(match.invoice.totalAmount || '0').toLocaleString()}</p>
                          <p><span className="font-medium">File:</span> {match.invoice.fileName}</p>
                          <p><span className="font-medium">Date:</span> {new Date(match.invoice.invoiceDate).toLocaleDateString()}</p>
                        </div>
                      </div>

                      {/* Purchase Order Details */}
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Target className="text-purple-600" size={16} />
                          <h4 className="font-medium text-purple-900">Purchase Order</h4>
                        </div>
                        <div className="text-sm space-y-1">
                          <p><span className="font-medium">PO ID:</span> {match.purchaseOrder.poId}</p>
                          <p><span className="font-medium">Vendor:</span> {match.purchaseOrder.vendorName}</p>
                          <p><span className="font-medium">Amount:</span> {match.purchaseOrder.currency} {parseFloat(match.purchaseOrder.amount || '0').toLocaleString()}</p>
                          <p><span className="font-medium">Project:</span> {match.purchaseOrder.projectId}</p>
                          <p><span className="font-medium">Issue Date:</span> {new Date(match.purchaseOrder.issueDate).toLocaleDateString()}</p>
                          <p><span className="font-medium">Status:</span> {match.purchaseOrder.status}</p>
                        </div>
                      </div>
                    </div>

                    {/* Match Details */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-medium text-gray-900">AI Match Analysis</h5>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Match Score:</span>
                          <span className="text-sm font-bold text-green-600">{parseFloat(match.matchScore).toFixed(1)}%</span>
                          {getMatchScoreBadge(match.matchScore)}
                          {getStatusBadge(match.status)}
                        </div>
                      </div>

                      {match.matchDetails && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.vendorSimilarity > 80 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Vendor ({match.matchDetails.vendorSimilarity || 0}%)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.amountSimilarity > 90 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Amount ({match.matchDetails.amountSimilarity || 0}%)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.projectSimilarity > 70 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Project ({match.matchDetails.projectSimilarity || 0}%)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.itemSimilarity > 60 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Items ({match.matchDetails.itemSimilarity || 0}%)</span>
                          </div>
                        </div>
                      )}

                      {match.matchDetails?.reasons && match.matchDetails.reasons.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700">AI Analysis:</p>
                          <ul className="text-xs text-gray-600 ml-2">
                            {match.matchDetails.reasons.slice(0, 3).map((reason: string, index: number) => (
                              <li key={index}>• {reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-3 pt-2">
                      {match.status === 'auto' && (
                        <>
                          <Button 
                            onClick={() => approveMatchMutation.mutate(match.id)}
                            disabled={approveMatchMutation.isPending}
                            className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Accept Match
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => rejectMatchMutation.mutate(match.id)}
                            disabled={rejectMatchMutation.isPending}
                            className="flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            Reject Match
                          </Button>
                        </>
                      )}
                      <Button 
                        variant="outline"
                        onClick={() => window.open(`/invoices/${match.invoiceId}`, '_blank')}
                        className="flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        View Invoice
                      </Button>
                      <Button 
                        variant="outline"
                        className="flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Matches Found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Click "Start AI Matching" to find matches between verified invoices and purchase orders.
                </p>
                <Button
                  onClick={() => startMatchingMutation.mutate()}
                  disabled={startMatchingMutation.isPending}
                  className="mt-4 flex items-center space-x-2"
                >
                  <Zap size={16} />
                  <span>Start AI Matching</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
