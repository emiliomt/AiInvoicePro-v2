import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download, Calendar, DollarSign, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { format } from "date-fns";
import { apiRequest, isUnauthorizedError } from "@/lib/authUtils";

interface Invoice {
  id: number;
  fileName: string;
  status: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: string | null;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  createdAt: string;
  userId: string;
}

export default function Invoices() {
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await apiRequest('DELETE', `/api/invoices/${invoiceId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "failed": return "bg-red-100 text-red-800";
      case "draft": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatAmount = (amount: string | null, currency: string) => {
    if (!amount) return "N/A";
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "MMM dd, yyyy");
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
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-24"></div>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-2">Manage and view all your processed invoices</p>
        </div>

        <div className="space-y-6">
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
                <p className="text-gray-600">Upload your first invoice to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {invoices.map((invoice) => (
                <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <CardTitle className="flex items-center space-x-2">
                          <FileText className="text-blue-600" size={20} />
                          <span>{invoice.fileName}</span>
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>Invoice #{invoice.invoiceNumber || "N/A"}</span>
                          <span>•</span>
                          <span>Uploaded {formatDate(invoice.createdAt)}</span>
                        </div>
                      </div>
                      <Badge className={getStatusColor(invoice.status)}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Vendor</p>
                        <p className="text-sm text-gray-900">{invoice.vendorName || "N/A"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Amount</p>
                        <p className="text-sm text-gray-900 flex items-center">
                          <DollarSign size={14} className="mr-1" />
                          {formatAmount(invoice.totalAmount, invoice.currency)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Invoice Date</p>
                        <p className="text-sm text-gray-900 flex items-center">
                          <Calendar size={14} className="mr-1" />
                          {formatDate(invoice.invoiceDate)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Due Date</p>
                        <p className="text-sm text-gray-900 flex items-center">
                          <Calendar size={14} className="mr-1" />
                          {formatDate(invoice.dueDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" size="sm">
                        <Eye size={16} className="mr-2" />
                        View Details
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download size={16} className="mr-2" />
                        Download
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 size={16} className="mr-2" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this invoice? This action cannot be undone.
                              This will permanently delete the invoice "{invoice.fileName}" and all its associated data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(invoice.id)}
                              className="bg-red-600 hover:bg-red-700"
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}