
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search verified invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Verified Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle>Verified Invoice-Project Assignments</CardTitle>
            <p className="text-sm text-gray-600">Invoices that have been successfully matched and verified for specific projects</p>
          </CardHeader>
          <CardContent>
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Verified Invoices</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm ? 'No invoices match your search criteria.' : 'No invoices have been verified yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Match Score</TableHead>
                      <TableHead>Verified By</TableHead>
                      <TableHead>Date Verified</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((verifiedInvoice) => (
                      <TableRow key={verifiedInvoice.id}>
                        <TableCell>
                          <div className="font-medium">#{verifiedInvoice.invoice.id}</div>
                          <div className="text-sm text-gray-500">
                            {formatDate(verifiedInvoice.invoice.dateIssued)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {verifiedInvoice.invoice.vendorName || 'Unknown Vendor'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {formatAmount(verifiedInvoice.invoice.totalAmount, verifiedInvoice.invoice.currency)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{verifiedInvoice.project.name}</div>
                            <div className="text-sm text-gray-500">
                              ID: {verifiedInvoice.project.projectId}
                            </div>
                            <div className="text-sm text-gray-500">
                              {verifiedInvoice.project.supervisor}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{parseFloat(verifiedInvoice.matchScore).toFixed(1)}%</div>
                            {getConfidenceBadge(verifiedInvoice.matchScore)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{verifiedInvoice.verifiedBy || verifiedInvoice.approvedBy}</div>
                        </TableCell>
                        <TableCell>
                          <div>{formatDate(verifiedInvoice.verifiedAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(`/invoices/${verifiedInvoice.invoiceId}`, '_blank')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
