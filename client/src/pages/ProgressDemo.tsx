
import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ProgressTracker } from '../components/ProgressTracker';
import { Play, FileText, Database } from 'lucide-react';

export default function ProgressDemo() {
  const [showRpaProgress, setShowRpaProgress] = useState(false);
  const [showImporterProgress, setShowImporterProgress] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState('');

  const startRpaDemo = () => {
    const taskId = `rpa_demo_${Date.now()}`;
    setCurrentTaskId(taskId);
    setShowRpaProgress(true);
    
    // Simulate starting an RPA task
    fetch('/api/rpa/demo-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId })
    });
  };

  const startImporterDemo = () => {
    const taskId = `importer_demo_${Date.now()}`;
    setCurrentTaskId(taskId);
    setShowImporterProgress(true);
    
    // Simulate starting an importer task
    fetch('/api/invoice-importer/demo-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId })
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Progress Tracking Demo</h1>
        <p className="text-gray-600 mt-2">
          Test the real-time progress tracking system with WebSocket connections
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              RPA Processing Demo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Demonstrates real-time progress tracking for RPA automation tasks
            </p>
            <Button onClick={startRpaDemo} className="w-full">
              <Play className="w-4 h-4 mr-2" />
              Start RPA Demo
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Invoice Importer Demo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Shows progress tracking for invoice import and processing tasks
            </p>
            <Button onClick={startImporterDemo} className="w-full">
              <Play className="w-4 h-4 mr-2" />
              Start Importer Demo
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Progress Modals */}
      <ProgressTracker
        isOpen={showRpaProgress}
        onClose={() => setShowRpaProgress(false)}
        taskId={currentTaskId}
        taskType="rpa"
        title="RPA Processing Progress"
      />

      <ProgressTracker
        isOpen={showImporterProgress}
        onClose={() => setShowImporterProgress(false)}
        taskId={currentTaskId}
        taskType="invoice_importer"
        title="Invoice Import Progress"
      />
    </div>
  );
}
