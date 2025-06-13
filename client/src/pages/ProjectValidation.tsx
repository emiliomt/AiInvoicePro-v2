import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit, Trash2, CheckCircle } from "lucide-react";
import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { apiRequest } from "@/lib/queryClient";

interface Project {
  id: number;
  projectId: string;
  name: string;
  address: string;
  city: string;
  vat: string | null;
  supervisor: string | null;
  status: 'pending' | 'validated' | 'rejected';
  createdAt: string;
}

interface EditProjectData {
  name: string;
  address: string;
  city: string;
  vat: string;
  supervisor: string;
}

export default function ProjectValidation() {
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editData, setEditData] = useState<EditProjectData>({
    name: '',
    address: '',
    city: '',
    vat: '',
    supervisor: ''
  });
  const [showEditModal, setShowEditModal] = useState(false);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const validateMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await apiRequest('PUT', `/api/projects/${projectId}/validate`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Project validated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditProjectData }) => {
      const response = await apiRequest('PUT', `/api/projects/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Project updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowEditModal(false);
      setEditingProject(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await apiRequest('DELETE', `/api/projects/${projectId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Project deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "validated": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setEditData({
      name: project.name,
      address: project.address,
      city: project.city,
      vat: project.vat || '',
      supervisor: project.supervisor || ''
    });
    setShowEditModal(true);
  };

  const handleUpdate = () => {
    if (editingProject) {
      updateMutation.mutate({
        id: editingProject.id,
        data: editData
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-16"></div>
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
          <h1 className="text-3xl font-bold text-gray-900">Validation Input Records</h1>
          <p className="text-gray-600 mt-2">Records automatically populated when validation criteria are applied to invoices</p>
        </div>

        <Card className="bg-white shadow-sm border border-gray-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold text-gray-900">Project</TableHead>
                  <TableHead className="font-semibold text-gray-900">Address</TableHead>
                  <TableHead className="font-semibold text-gray-900">City</TableHead>
                  <TableHead className="font-semibold text-gray-900">VAT</TableHead>
                  <TableHead className="font-semibold text-gray-900">Supervisor</TableHead>
                  <TableHead className="font-semibold text-gray-900">Status</TableHead>
                  <TableHead className="font-semibold text-gray-900">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="text-gray-500">
                        <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No validation records found</h3>
                        <p className="text-gray-600">Validation records will appear here when invoices are processed.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((project) => (
                    <TableRow key={project.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div>
                          <div className="font-semibold text-gray-900">{project.name}</div>
                          <div className="text-sm text-gray-500">{project.projectId}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-700">{project.address}</TableCell>
                      <TableCell className="text-gray-700">{project.city}</TableCell>
                      <TableCell className="text-gray-700">
                        {project.vat ? (
                          <div className="flex items-center">
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                            {project.vat}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        {project.supervisor || <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(project.status)}>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {project.status === 'validated' ? 'Validated' : 
                           project.status === 'pending' ? 'Pending' : 'Rejected'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Dialog open={showEditModal && editingProject?.id === project.id} onOpenChange={(open) => {
                            if (!open) {
                              setShowEditModal(false);
                              setEditingProject(null);
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(project)}
                                className="text-gray-600 hover:text-blue-600"
                              >
                                <Edit className="w-4 h-4" />
                                Edit
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Project</DialogTitle>
                                <DialogDescription>
                                  Update project validation information
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="name">Project Name</Label>
                                  <Input
                                    id="name"
                                    value={editData.name}
                                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="address">Address</Label>
                                  <Input
                                    id="address"
                                    value={editData.address}
                                    onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="city">City</Label>
                                  <Input
                                    id="city"
                                    value={editData.city}
                                    onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="vat">VAT</Label>
                                  <Input
                                    id="vat"
                                    value={editData.vat}
                                    onChange={(e) => setEditData({ ...editData, vat: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="supervisor">Supervisor</Label>
                                  <Input
                                    id="supervisor"
                                    value={editData.supervisor}
                                    onChange={(e) => setEditData({ ...editData, supervisor: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end space-x-2 pt-4">
                                <Button 
                                  variant="outline" 
                                  onClick={() => setShowEditModal(false)}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={handleUpdate}
                                  disabled={updateMutation.isPending}
                                >
                                  {updateMutation.isPending ? "Updating..." : "Update"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                              >
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this project validation record? 
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(project.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                  disabled={deleteMutation.isPending}
                                >
                                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}