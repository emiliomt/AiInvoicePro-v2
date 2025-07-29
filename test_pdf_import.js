#!/usr/bin/env node

// Test script to trigger PDF-only import and capture debug output
import { spawn } from 'child_process';

async function testPDFImport() {
  try {
    console.log('🔧 Starting PDF-only import test...');
    
    // Create the JSON configuration for PDF-only import (config ID 22)
    const config = {
      erpUrl: "https://www3.sincoerp.com/SincoObycon_Nueva/V3/Marco/Login.aspx",
      erpUsername: "eceronr",
      erpPassword: "T2J5Y29uKjIwMjU=", // Base64 encoded password
      fileTypes: "pdf",
      downloadPath: "/tmp/invoice_downloads",
      xmlPath: "/tmp/xml_invoices", 
      pdfPath: "/tmp/pdf_invoices",
      headless: false, // Keep visible for debugging
      configId: 22
    };
    
    // Directly run the Python RPA service with PDF configuration
    const pythonCommand = 'python3';
    const pythonArgs = [
      'server/services/pythonRpaService.py',
      JSON.stringify(config)
    ];
    
    console.log('🔧 Executing Python RPA service:', pythonCommand, pythonArgs.join(' '));
    
    const pythonProcess = spawn(pythonCommand, pythonArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capture output
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('📄 [STDOUT]:', output.trim());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log('⚠️ [STDERR]:', output.trim());
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`🔧 Python process exited with code: ${code}`);
      console.log('\n📊 FULL OUTPUT SUMMARY:');
      console.log('=== STDOUT ===');
      console.log(stdout);
      console.log('=== STDERR ===');
      console.log(stderr);
    });
    
    pythonProcess.on('error', (error) => {
      console.error('❌ Python process error:', error);
    });
    
    // Wait for process to complete
    await new Promise((resolve, reject) => {
      pythonProcess.on('close', resolve);
      pythonProcess.on('error', reject);
      
      // Timeout after 2 minutes
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Python process timeout'));
      }, 120000);
    });
    
  } catch (error) {
    console.error('❌ PDF import test failed:', error);
  }
}

// Run the test
testPDFImport().then(() => {
  console.log('🔧 Test script completed');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Test script error:', error);
  process.exit(1);
});