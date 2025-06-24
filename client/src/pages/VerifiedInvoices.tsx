
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Search, 
  Eye, 
  Download,
  FileText,
  XCircle
} from 'lucide-react';
import Header from '@/components/Header';

interface VerifiedInvoice {
  id: number;
  invoiceId: number;
  projectId: number;
  matchScore: string;
  status: string;
  verifiedAt: string;
  verifiedBy: string;
  invoice: {
    id: number;
    fileName: string;
    vendorName: string;
    totalAmount: string;
    currency: string;
    dateIssued: string;
  };
  project: {
    id: number;
    name: string;
    projectId: string;
    address: string;
    supervisor: string;
  };
}

export default function VerifiedInvoices() {
  const [verifiedInvoices, setVerifiedInvoices] = useState<VerifiedInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchVerifiedInvoices();
  }, []);

  const fetchVerifiedInvoices = async () => {
    try {
      const response = await fetch('/api/verified-invoice-projects');
      if (response.ok) {
        const data = await response.json();
        setVerifiedInvoices(data);
      }
    } catch (error) {
      console.error('Error fetching verified invoices:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredInvoices = verifiedInvoices.filter(invoice =>
    invoice.invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalVerified = verifiedInvoices.length;
  const highConfidence = verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 90).length;
  const mediumConfidence = verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 70 && parseFloat(v.matchScore) < 90).length;
  const lowConfidence = verifiedInvoices.filter(v => parseFloat(v.matchScore) < 70).length;

  const getConfidenceBadge = (score: string) => {
    const numScore = parseFloat(score);
    if (numScore >= 90) {
      return <Badge className="bg-green-100 text-green-800">High Confidence</Badge>;
    } else if (numScore >= 70) {
      return <Badge className="bg-yellow-100 text-yellow-800">Medium Confidence</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Low Confidence</Badge>;
    }
  };

  const formatAmount = (amount: string | null, currency: string) => {
    if (!amount) return "N/A";
    const numericAmount = parseFloat(amount);
    const formattedNumber = numericAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${currency} ${formattedNumber}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return "Invalid date";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Verified Invoice-Project Matches</h1>
          <p className="text-gray-600 mt-2">Review verified invoice-project assignments that have been validated</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Verified</p>
                  <p className="text-3xl font-bold text-green-600">{totalVerified}</p>
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
                  <p className="text-3xl font-bold text-green-600">{highConfidence}</p>
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
                  <p className="text-sm font-medium text-gray-600">Medium Confidence</p>
                  <p className="text-3xl font-bold text-yellow-600">{mediumConfidence}</p>
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
                  <p className="text-sm font-medium text-gray-600">Low Confidence</p>
                  <p className="text-3xl font-bold text-red-600">{lowConfidence}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="text-red-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search verified invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Verified Invoice-Project Matches */}
        <Card>
          <CardHeader className="border-b bg-purple-50">
            <CardTitle className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                <CheckCircle className="text-white" size={16} />
              </div>
              <span>Verified Invoice-Project Matches</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Verified Invoices</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm ? 'No invoices match your search criteria.' : 'No invoices have been verified yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredInvoices.map((verifiedInvoice) => (
                  <div key={verifiedInvoice.id} className="border rounded-lg p-6 space-y-4 bg-white shadow-sm">
                    {/* Invoice and Project Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Invoice Details */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <FileText className="text-blue-600" size={16} />
                          <h4 className="font-medium text-blue-900">Invoice</h4>
                        </div>
                        <div className="text-sm space-y-2 bg-gray-50 p-4 rounded-lg">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">ID:</span>
                            <span className="text-gray-900">{verifiedInvoice.invoice.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Vendor:</span>
                            <span className="text-gray-900">{verifiedInvoice.invoice.vendorName || "Unknown"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Amount:</span>
                            <span className="text-gray-900 font-medium">
                              {formatAmount(verifiedInvoice.invoice.totalAmount, verifiedInvoice.invoice.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">File:</span>
                            <span className="text-gray-900 text-xs break-all">
                              {verifiedInvoice.invoice.fileName || "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Date:</span>
                            <span className="text-gray-900">{formatDate(verifiedInvoice.invoice.dateIssued)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Project Details */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                          <h4 className="font-medium text-purple-900">Project</h4>
                        </div>
                        <div className="text-sm space-y-2 bg-gray-50 p-4 rounded-lg">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Project ID:</span>
                            <span className="text-gray-900">{verifiedInvoice.project.projectId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Name:</span>
                            <span className="text-gray-900">{verifiedInvoice.project.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">Address:</span>
                            <span className="text-gray-900 text-xs">{verifiedInvoice.project.address}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">City:</span>
                            <span className="text-gray-900">Barranquilla</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Match Details */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h5 className="font-medium mb-3">Match Details</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <XCircle className="text-red-500" size={16} />
                          <span className="text-gray-600">Project Name Match (0%)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <XCircle className="text-red-500" size={16} />
                          <span className="text-gray-600">Address Match (0%)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <XCircle className="text-red-500" size={16} />
                          <span className="text-gray-600">City Match (0%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Match Score:</span>
                          <span className="text-lg font-bold">{parseFloat(verifiedInvoice.matchScore).toFixed(1)}%</span>
                          {getConfidenceBadge(verifiedInvoice.matchScore)}
                        </div>
                      </div>
                    </div>

                    {/* Verification Details */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <span>Verified by: <span className="font-medium">{verifiedInvoice.verifiedBy}</span></span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Approved: {formatDate(verifiedInvoice.verifiedAt)} | Verified: {formatDate(verifiedInvoice.verifiedAt)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-3 pt-4 border-t">
                      <Button 
                        variant="outline"
                        onClick={() => window.open(`/invoices/${verifiedInvoice.invoiceId}`, '_blank')}
                        className="flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View Invoice
                      </Button>
                      <Button 
                        variant="outline"
                        className="flex items-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
