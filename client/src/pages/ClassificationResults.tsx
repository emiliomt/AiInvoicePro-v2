
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { useToast } from '../hooks/use-toast';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Edit,
  Download,
  Filter,
  Search,
  FileText,
  TrendingUp,
  Clock,
  Target
} from 'lucide-react';

interface ClassifiedItem {
  id: number;
  invoiceId: string;
  vendor: string;
  description: string;
  aiCategory: string;
  confidence: number;
  amount: number;
  currency: string;
  status: 'auto_approved' | 'needs_review' | 'manual_override' | 'rejected';
  keywordsMatched: string[];
  timestamp: string;
  overrideReason?: string;
  overriddenBy?: string;
  originalCategory?: string;
}

interface ClassificationStats {
  totalItems: number;
  autoApprovalRate: number;
  itemsNeedingReview: number;
  averageConfidence: number;
  categoryCounts: Record<string, number>;
}

const CATEGORIES = [
  'CONSUMABLE_MATERIALS',
  'NON_CONSUMABLE_MATERIALS', 
  'LABOR',
  'TOOLS_EQUIPMENT'
];

const STATUS_COLORS = {
  auto_approved: 'bg-green-100 text-green-800',
  needs_review: 'bg-yellow-100 text-yellow-800',
  manual_override: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800'
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.85) return 'text-green-600 bg-green-50';
  if (confidence >= 0.60) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
};

export default function ClassificationResults() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingItem, setEditingItem] = useState<ClassifiedItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [newCategory, setNewCategory] = useState('');

  // Fetch classification results
  const { data: classifiedItems = [], isLoading } = useQuery({
    queryKey: ['/api/classification-results'],
    queryFn: async () => {
      const response = await fetch('/api/classification-results');
      if (!response.ok) throw new Error('Failed to fetch classification results');
      return response.json();
    }
  });

  // Fetch classification statistics
  const { data: stats } = useQuery({
    queryKey: ['/api/classification-results/stats'],
    queryFn: async () => {
      const response = await fetch('/api/classification-results/stats');
      if (!response.ok) throw new Error('Failed to fetch classification stats');
      return response.json();
    }
  });

  // Update classification mutation
  const updateClassificationMutation = useMutation({
    mutationFn: async ({ id, category, reason }: { id: number; category: string; reason: string }) => {
      const response = await fetch(`/api/classification-results/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          overrideReason: reason,
          status: 'manual_override'
        })
      });
      if (!response.ok) throw new Error('Failed to update classification');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/classification-results'] });
      queryClient.invalidateQueries({ queryKey: ['/api/classification-stats'] });
      setIsEditDialogOpen(false);
      setEditingItem(null);
      setOverrideReason('');
      toast({
        title: "Classification Updated",
        description: "The classification has been successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update classification. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (itemIds: number[]) => {
      const response = await fetch('/api/classification-results/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds })
      });
      if (!response.ok) throw new Error('Failed to bulk approve');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/classification-results'] });
      queryClient.invalidateQueries({ queryKey: ['/api/classification-stats'] });
      setSelectedItems([]);
      toast({
        title: "Items Approved",
        description: `${selectedItems.length} items have been approved.`,
      });
    }
  });

  // Export results mutation
  const exportResultsMutation = useMutation({
    mutationFn: async (format: 'csv' | 'excel') => {
      const response = await fetch('/api/classification-results/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          itemIds: selectedItems.length > 0 ? selectedItems : undefined,
          format 
        })
      });
      if (!response.ok) throw new Error('Failed to export results');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resultados-clasificacion-anzudynamics.${format === 'csv' ? 'csv' : 'xlsx'}`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      setIsExportDialogOpen(false);
      toast({
        title: "Exportación Completa / Export Complete",
        description: "Los resultados de clasificación han sido exportados exitosamente / Classification results have been exported successfully.",
      });
    }
  });

  // Filter and search logic
  const filteredItems = classifiedItems.filter((item: ClassifiedItem) => {
    const matchesSearch = searchTerm === '' || 
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.invoiceId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || item.aiCategory === filterCategory;
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleEditClassification = (item: ClassifiedItem) => {
    setEditingItem(item);
    setNewCategory(item.aiCategory);
    setOverrideReason('');
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem || !newCategory || !overrideReason.trim()) return;
    
    updateClassificationMutation.mutate({
      id: editingItem.id,
      category: newCategory,
      reason: overrideReason.trim()
    });
  };

  const toggleItemSelection = (itemId: number) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = filteredItems.map((item: ClassifiedItem) => item.id);
    setSelectedItems(visibleIds);
  };

  const clearSelection = () => {
    setSelectedItems([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading classification results...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Resultados de Clasificación / Classification Results
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Revise y gestione los elementos de línea de factura clasificados por IA / Review and manage AI-classified invoice line items
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => setIsExportDialogOpen(true)}
            disabled={filteredItems.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar / Export
          </Button>
          {selectedItems.length > 0 && (
            <Button
              onClick={() => bulkApproveMutation.mutate(selectedItems)}
              disabled={bulkApproveMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Aprobar Seleccionados / Approve Selected ({selectedItems.length})
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Items / Elementos Totales</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalItems}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Auto-Approval Rate / Tasa de Auto-aprobación</p>
                  <p className="text-3xl font-bold text-green-600">{stats.autoApprovalRate}%</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Need Review / Necesitan Revisión</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats.itemsNeedingReview}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Avg Confidence / Confianza Promedio</p>
                  <p className="text-3xl font-bold" style={{color: 'hsl(214, 76%, 59%)'}}>{stats.averageConfidence}%</p>
                </div>
                <Target className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar por descripción, proveedor o factura... / Search by description, vendor, or invoice..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por categoría / Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Categorías / All Categories</SelectItem>
                {CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por estado / Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los Estados / All Statuses</SelectItem>
                <SelectItem value="auto_approved">Auto Aprobado / Auto Approved</SelectItem>
                <SelectItem value="needs_review">Necesita Revisión / Needs Review</SelectItem>
                <SelectItem value="manual_override">Anulación Manual / Manual Override</SelectItem>
                <SelectItem value="rejected">Rechazado / Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedItems.length > 0 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <span className="text-sm text-gray-600">
                {selectedItems.length} elementos seleccionados / items selected
              </span>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={selectAllVisible}>
                  Seleccionar Todos / Select All Visible
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Limpiar Selección / Clear Selection
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resultados de Clasificación / Classification Results ({filteredItems.length})</CardTitle>
          <CardDescription>
            Revise las clasificaciones de IA y haga correcciones según sea necesario / Review AI classifications and make corrections as needed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                      onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Factura / Invoice</TableHead>
                  <TableHead>Proveedor / Vendor</TableHead>
                  <TableHead>Descripción / Description</TableHead>
                  <TableHead>Categoría / Category</TableHead>
                  <TableHead>Confianza / Confidence</TableHead>
                  <TableHead>Monto / Amount</TableHead>
                  <TableHead>Estado / Status</TableHead>
                  <TableHead>Acciones / Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item: ClassifiedItem) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.invoiceId}</TableCell>
                    <TableCell>{item.vendor}</TableCell>
                    <TableCell className="max-w-xs truncate" title={item.description}>
                      {item.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.aiCategory}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-sm font-medium ${getConfidenceColor(item.confidence)}`}>
                        {(item.confidence * 100).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: item.currency
                      }).format(item.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[item.status]}>
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClassification(item)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Classification Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Classification</DialogTitle>
            <DialogDescription>
              Update the category and provide a reason for the change
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4">
              <div>
                <Label>Description</Label>
                <p className="text-sm text-gray-600 mt-1">{editingItem.description}</p>
              </div>
              <div>
                <Label>Original Category</Label>
                <p className="text-sm text-gray-600 mt-1">{editingItem.aiCategory}</p>
              </div>
              <div>
                <Label htmlFor="new-category">New Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="override-reason">Reason for Change</Label>
                <Textarea
                  id="override-reason"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this classification needs to be changed..."
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={!newCategory || !overrideReason.trim() || updateClassificationMutation.isPending}
            >
              {updateClassificationMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <AlertDialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export Classification Results</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the format for exporting your classification results.
              {selectedItems.length > 0 
                ? ` Only selected items (${selectedItems.length}) will be exported.`
                : " All filtered results will be exported."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => exportResultsMutation.mutate('csv')}>
              Export as CSV
            </AlertDialogAction>
            <AlertDialogAction onClick={() => exportResultsMutation.mutate('excel')}>
              Export as Excel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
