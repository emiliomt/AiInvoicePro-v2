import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Target, AlertTriangle, CheckCircle, XCircle, TrendingUp, FileText, Eye, Download } from "lucide-react";

interface VerifiedInvoiceProject {
  id: number;
  invoiceId: number;
  projectId: string;
  matchScore: string;
  matchDetails: any;
  approvedBy: string;
  approvedAt: string;
  verifiedAt: string;
  createdAt: string;
  validationResults: any;
  invoice: {
    id: number;
    fileName: string;
    vendorName: string;
    totalAmount: string;
    currency: string;
    invoiceDate: string;
    status: string;
  };
  project: {
    projectId: string;
    name: string;
    address: string;
    city: string;
    supervisor: string;
  };
}

export default function POMatching() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch verified invoice-project matches
  const { data: verifiedInvoices = [], isLoading } = useQuery<VerifiedInvoiceProject[]>({
    queryKey: ["/api/verified-invoice-projects"],
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div>Loading verified invoice-project matches...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Verified Invoice-Project Matches</h1>
          <p className="text-gray-600 mt-2">
            Review verified invoice-project assignments that have been validated
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Verified</p>
                  <p className="text-3xl font-bold text-green-600">{verifiedInvoices.length}</p>
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
                  <p className="text-sm font-medium text-gray-600">High Confidence</p>
                  <p className="text-3xl font-bold text-green-600">
                    {verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 90).length}
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
                  <p className="text-sm font-medium text-gray-600">Medium Confidence</p>
                  <p className="text-3xl font-bold text-yellow-600">
                    {verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 70 && parseFloat(v.matchScore) < 90).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="text-yellow-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Verified Invoice-Project Matches */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="text-purple-600" size={20} />
              <span>Verified Invoice-Project Matches</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {verifiedInvoices.length > 0 ? (
              <div className="space-y-6">
                {verifiedInvoices.map((match) => (
                  <div key={match.id} className="border rounded-lg p-6 space-y-4">
                    {/* Invoice and Project Information */}
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

                      {/* Project Details */}
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Target className="text-purple-600" size={16} />
                          <h4 className="font-medium text-purple-900">Project</h4>
                        </div>
                        <div className="text-sm space-y-1">
                          <p><span className="font-medium">Project ID:</span> {match.project.projectId}</p>
                          <p><span className="font-medium">Name:</span> {match.project.name}</p>
                          <p><span className="font-medium">Address:</span> {match.project.address}</p>
                          <p><span className="font-medium">City:</span> {match.project.city}</p>
                          <p><span className="font-medium">Supervisor:</span> {match.project.supervisor}</p>
                        </div>
                      </div>
                    </div>

                    {/* Match Details */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-medium text-gray-900">Match Details</h5>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Match Score:</span>
                          <span className="text-sm font-bold text-green-600">{parseFloat(match.matchScore).toFixed(1)}%</span>
                          {getMatchScoreBadge(match.matchScore)}
                        </div>
                      </div>

                      {match.matchDetails && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.projectNameSimilarity > 70 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Project Name Match ({match.matchDetails.projectNameSimilarity || 0}%)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.addressSimilarity > 60 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>Address Match ({match.matchDetails.addressSimilarity || 0}%)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {match.matchDetails.citySimilarity > 80 ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : (
                              <XCircle size={14} className="text-red-500" />
                            )}
                            <span>City Match ({match.matchDetails.citySimilarity || 0}%)</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Verification Info */}
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-green-900">Verified by: {match.approvedBy}</p>
                          <p className="text-sm text-green-700">
                            Approved: {new Date(match.approvedAt).toLocaleDateString()} | 
                            Verified: {new Date(match.verifiedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-3 pt-2">
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
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Verified Matches</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No verified invoice-project matches found.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}