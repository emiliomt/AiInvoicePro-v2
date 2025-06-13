
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
          <h1 className="text-3xl font-bold text-gray-900">Project Validation</h1>
          <p className="text-gray-600 mt-2">Manage and validate project information</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-600">No projects found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{project.name}</div>
                          <div className="text-sm text-gray-500">{project.projectId}</div>
                        </div>
                      </TableCell>
                      <TableCell>{project.address}</TableCell>
                      <TableCell>{project.city}</TableCell>
                      <TableCell>{project.vat || "—"}</TableCell>
                      <TableCell>{project.supervisor || "—"}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(project.status)}>
                          {project.status}
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
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Project</DialogTitle>
                                <DialogDescription>
                                  Update project information
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
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this project? This action cannot be undone.
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
