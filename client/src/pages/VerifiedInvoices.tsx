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
  const flagged = 0; // You can implement flagged logic
  const needsReview = verifiedInvoices.filter(v => parseFloat(v.matchScore) >= 70 && parseFloat(v.matchScore) < 90).length;
  const pending = 0; // You can implement pending logic

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Verification Status</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor and verify invoice authenticity and compliance across all submissions</p>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <span className="text-2xl font-bold text-gray-900">{totalVerified}</span>
            <span className="text-sm text-gray-500 ml-2">Total Invoices</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <span className="text-2xl font-bold text-green-600">{highConfidence}</span>
            <span className="text-sm text-gray-500 ml-2">Verified</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-red-100 rounded flex items-center justify-center">
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <span className="text-2xl font-bold text-red-600">{flagged}</span>
            <span className="text-sm text-gray-500 ml-2">Flagged</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-yellow-100 rounded flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
          </div>
          <div>
            <span className="text-2xl font-bold text-yellow-600">{needsReview}</span>
            <span className="text-sm text-gray-500 ml-2">Needs Review</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
            <Clock className="w-4 h-4 text-gray-600" />
          </div>
          <div>
            <span className="text-2xl font-bold text-gray-600">{pending}</span>
            <span className="text-sm text-gray-500 ml-2">Pending</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select className="px-3 py-2 border rounded-md">
          <option>All</option>
        </select>
        <select className="px-3 py-2 border rounded-md">
          <option>All</option>
        </select>
      </div>

      {/* Verified Invoice-Project Assignments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Verified Invoice-Project Assignments</CardTitle>
          <p className="text-sm text-gray-600">Invoices that have been successfully matched and verified for specific projects</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading verified invoices...</span>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Verified Invoices
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No invoices have been verified yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Details</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Match Score</TableHead>
                    <TableHead>Verified By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((verifiedInvoice) => (
                    <TableRow key={verifiedInvoice.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">ID: {verifiedInvoice.invoice.id}</div>
                          <div className="text-sm text-gray-500">{verifiedInvoice.invoice.dateIssued}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{verifiedInvoice.invoice.vendorName || 'Unknown'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {verifiedInvoice.invoice.currency} {parseFloat(verifiedInvoice.invoice.totalAmount || '0').toLocaleString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{verifiedInvoice.project.name}</div>
                          <div className="text-sm text-gray-500">
                            ID: {verifiedInvoice.project.projectId}
                          </div>
                          <div className="text-sm text-gray-500">
                            Supervisor: {verifiedInvoice.project.supervisor}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{parseFloat(verifiedInvoice.matchScore).toFixed(1)}%</div>
                          {getConfidenceBadge(verifiedInvoice.matchScore)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{verifiedInvoice.verifiedBy}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(verifiedInvoice.verifiedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
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
  );
}