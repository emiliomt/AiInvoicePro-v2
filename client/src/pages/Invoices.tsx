import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileText, 
  Eye, 
  Download, 
  Filter,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MoreHorizontal,
  RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Invoice {
  id: string;
  filename: string;
  status: string;
  uploadedAt: string;
  processedAt?: string;
  vendorName?: string;
  totalAmount?: string;
  invoiceDate?: string;
  currency?: string;
  extractedData?: any;
  validationResults?: any;
  processingErrors?: string[];
}

export default function Invoices() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  // Fetch invoices
  const { data: invoices = [], isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ['/api/invoices'],
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiRequest('POST', '/api/invoices/upload', formData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload invoice",
        variant: "destructive",
      });
    },
  });

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Handle upload
  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'processing':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-3xl font-bold">Invoices</h1>
            <p className="text-gray-600 mt-1">Manage and process your invoices</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Upload className="w-5 h-5 mr-2" />
              Upload Invoice
            </CardTitle>
            <CardDescription>
              Upload PDF or XML invoice files for processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input
                  type="file"
                  accept=".pdf,.xml"
                  onChange={handleFileSelect}
                  disabled={uploadMutation.isPending}
                />
              </div>
              <Button 
                onClick={handleUpload}
                disabled={!selectedFile || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Upload
              </Button>
            </div>
            {selectedFile && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {selectedFile.name}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInvoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {invoice.filename}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        ID: {invoice.id.slice(0, 8)}...
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge className={`${getStatusColor(invoice.status)} flex items-center space-x-1`}>
                      {getStatusIcon(invoice.status)}
                      <span className="capitalize">{invoice.status}</span>
                    </Badge>
                  </div>

                  {/* Vendor Name */}
                  {invoice.vendorName && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Vendor:</span>
                      <span className="text-sm text-gray-600 truncate max-w-32">
                        {invoice.vendorName}
                      </span>
                    </div>
                  )}

                  {/* Total Amount */}
                  {invoice.totalAmount && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Amount:</span>
                      <span className="text-sm font-semibold">
                        {invoice.currency || '$'} {invoice.totalAmount}
                      </span>
                    </div>
                  )}

                  {/* Invoice Date */}
                  {invoice.invoiceDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Date:</span>
                      <span className="text-sm text-gray-600">
                        {new Date(invoice.invoiceDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {/* Upload Date */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Uploaded:</span>
                    <span className="text-sm text-gray-600">
                      {new Date(invoice.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Processing Errors */}
                  {invoice.processingErrors && invoice.processingErrors.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <p className="text-xs text-red-700">
                        {invoice.processingErrors[0]}
                        {invoice.processingErrors.length > 1 && (
                          <span className="ml-1">
                            (+{invoice.processingErrors.length - 1} more)
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredInvoices.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No invoices found
              </h3>
              <p className="text-gray-600 text-center max-w-md">
                {searchTerm || statusFilter !== 'all' 
                  ? "No invoices match your current filters. Try adjusting your search or filter criteria."
                  : "Upload your first invoice to get started with automated processing."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}