
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Target, Search, Eye, CheckCircle, Clock, XCircle, Zap } from "lucide-react";
import ProjectMatchingManager from "@/components/ProjectMatchingManager";

interface Invoice {
  id: number;
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: string | null;
  currency: string;
  fileName: string;
  createdAt: string;
  projectMatch?: {
    matchStatus: "pending" | "matched" | "rejected" | "auto_matched";
    confidence: number | null;
    projectId: string | null;
  };
}

export default function ProjectMatchingIndex() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Get all invoices
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/invoices'],
  });

  const getStatusBadge = (status?: string, confidence?: number | null) => {
    if (!status) {
      return <Badge variant="secondary" className="bg-gray-100 text-gray-800"><Clock size={14} className="mr-1" />Not Analyzed</Badge>;
    }
    
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock size={14} className="mr-1" />Pending</Badge>;
      case "matched":
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle size={14} className="mr-1" />Matched</Badge>;
      case "auto_matched":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Zap size={14} className="mr-1" />Auto-Matched ({confidence}%)</Badge>;
      case "rejected":
        return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle size={14} className="mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch = !searchTerm || 
      invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = !statusFilter || 
      (statusFilter === "unmatched" && !invoice.projectMatch) ||
      (statusFilter !== "unmatched" && invoice.projectMatch?.matchStatus === statusFilter);

    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div>Loading invoices...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-600" />
            Invoice-Project Matching
          </h1>
          <p className="text-muted-foreground">
            AI-powered matching of invoices to projects
          </p>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by vendor, invoice number, or file name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Statuses</option>
              <option value="unmatched">Not Analyzed</option>
              <option value="pending">Pending</option>
              <option value="matched">Matched</option>
              <option value="auto_matched">Auto-Matched</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices ({filteredInvoices.length})</CardTitle>
          <CardDescription>
            Click "Match Project" to analyze and assign projects to invoices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">#{invoice.invoiceNumber || "N/A"}</div>
                      <div className="text-sm text-gray-500">{invoice.fileName}</div>
                    </div>
                  </TableCell>
                  <TableCell>{invoice.vendorName || "N/A"}</TableCell>
                  <TableCell>
                    {invoice.totalAmount ? `${invoice.totalAmount} ${invoice.currency}` : "N/A"}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(invoice.projectMatch?.matchStatus, invoice.projectMatch?.confidence)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Link href={`/invoices/${invoice.id}/match-project`}>
                        <Button size="sm" variant="outline">
                          <Target size={16} className="mr-2" />
                          Match Project
                        </Button>
                      </Link>
                      <Link href={`/invoices/${invoice.id}`}>
                        <Button size="sm" variant="ghost">
                          <Eye size={16} className="mr-2" />
                          View
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No invoices found matching your criteria
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Project Matching Manager */}
      <ProjectMatchingManager showAllMatches={true} />
    </div>
  );
}
