import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Target, AlertTriangle, CheckCircle, XCircle, TrendingUp, FileText } from "lucide-react";

interface UnresolvedMatch {
  id: number;
  invoiceId: number;
  poId: number;
  matchScore: string;
  status: "auto" | "manual" | "unresolved";
  matchDetails: any;
  invoice: {
    id: number;
    vendorName: string | null;
    invoiceNumber: string | null;
    totalAmount: string | null;
    fileName: string;
    createdAt: string;
  };
  purchaseOrder: {
    id: number;
    poId: string;
    vendorName: string;
    projectId: string | null;
    amount: string;
    currency: string;
    items: any[];
    status: string;
  };
}

export default function POMatching() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch unresolved matches
  const { data: unresolvedMatches = [], isLoading } = useQuery<UnresolvedMatch[]>({
    queryKey: ["/api/matches/unresolved"],
  });

  // Update match status mutation
  const updateMatchMutation = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: number; status: string }) => {
      const response = await fetch(`/api/invoice-matches/${matchId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update match");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches/unresolved"] });
      toast({
        title: "Success",
        description: "Match status updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAcceptMatch = (matchId: number) => {
    updateMatchMutation.mutate({ matchId, status: "manual" });
  };

  const handleRejectMatch = (matchId: number) => {
    updateMatchMutation.mutate({ matchId, status: "unresolved" });
  };

  const getMatchConfidenceColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreVariant = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div>Loading PO matching issues...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">PO Matching Issues</h1>
          <p className="text-gray-600 mt-2">
            Review and resolve invoice-purchase order matching conflicts
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Unresolved Matches</p>
                  <p className="text-3xl font-bold text-yellow-600">{unresolvedMatches.length}</p>
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
                  <p className="text-sm font-medium text-gray-600">High Confidence</p>
                  <p className="text-3xl font-bold text-green-600">
                    {unresolvedMatches.filter(m => parseInt(m.matchScore) >= 80).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-green-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Needs Review</p>
                  <p className="text-3xl font-bold text-red-600">
                    {unresolvedMatches.filter(m => parseInt(m.matchScore) < 60).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="text-red-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Unresolved Matches */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="text-purple-600" size={20} />
              <span>Unresolved Invoice-PO Matches</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unresolvedMatches.length > 0 ? (
              <div className="space-y-6">
                {unresolvedMatches.map((match) => (
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
                          <p><span className="font-medium">Number:</span> {match.invoice.invoiceNumber || "N/A"}</p>
                          <p><span className="font-medium">Vendor:</span> {match.invoice.vendorName || "Unknown"}</p>
                          <p><span className="font-medium">Amount:</span> ${match.invoice.totalAmount || "0.00"}</p>
                          <p><span className="font-medium">File:</span> {match.invoice.fileName}</p>
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
                          <p><span className="font-medium">Amount:</span> {match.purchaseOrder.currency} {match.purchaseOrder.amount}</p>
                          <p><span className="font-medium">Project:</span> {match.purchaseOrder.projectId || "Unassigned"}</p>
                          <Badge variant="outline" className="text-xs">
                            {match.purchaseOrder.status}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Match Confidence */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Match Confidence</span>
                        <span className={`text-sm font-bold ${getMatchConfidenceColor(parseInt(match.matchScore))}`}>
                          {match.matchScore}%
                        </span>
                      </div>
                      <Progress 
                        value={parseInt(match.matchScore)} 
                        className="h-3"
                      />
                    </div>

                    {/* Match Details */}
                    {match.matchDetails && (
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <h5 className="text-sm font-medium text-gray-900">Match Analysis</h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.vendorMatch ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Vendor Match</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.amountMatch ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Amount Match</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.totalItemsMatched > 0 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>{match.matchDetails.totalItemsMatched || 0} Items Matched</span>
                          </div>
                        </div>
                        
                        {match.matchDetails.itemMatches && match.matchDetails.itemMatches.length > 0 && (
                          <div className="mt-3">
                            <h6 className="text-xs font-medium text-gray-700 mb-2">Item Matches:</h6>
                            <div className="space-y-1">
                              {match.matchDetails.itemMatches.slice(0, 3).map((item: any, idx: number) => (
                                <div key={idx} className="text-xs text-gray-600">
                                  <span className="font-medium">Invoice:</span> {item.invoiceItem} →{" "}
                                  <span className="font-medium">PO:</span> {item.poItem} ({Math.round(item.similarity * 100)}% similar)
                                </div>
                              ))}
                              {match.matchDetails.itemMatches.length > 3 && (
                                <div className="text-xs text-gray-500">
                                  +{match.matchDetails.itemMatches.length - 3} more matches
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex space-x-3 pt-2">
                      <Button 
                        onClick={() => handleAcceptMatch(match.id)}
                        disabled={updateMatchMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Accept Match
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => handleRejectMatch(match.id)}
                        disabled={updateMatchMutation.isPending}
                      >
                        Reject Match
                      </Button>
                      <Button 
                        variant="ghost"
                        onClick={() => window.open(`/invoices/${match.invoiceId}`, '_blank')}
                      >
                        View Invoice
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Unresolved Matches</h3>
                <p className="mt-1 text-sm text-gray-500">
                  All invoice-PO matches have been resolved or there are no pending matches.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}