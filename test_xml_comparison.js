#!/usr/bin/env node

// Test script to compare XML import vs PDF import login behavior
import { spawn } from 'child_process';

async function testXMLImport() {
  try {
    console.log('🔧 Starting XML import test for comparison...');
    
    // Create the JSON configuration for XML import (config ID 19) 
    const config = {
      erpUrl: "https://www3.sincoerp.com/SincoObycon_Nueva/V3/Marco/Login.aspx",
      erpUsername: "eceronr",
      erpPassword: "T2J5Y29uKjIwMjU=", // Same credentials as PDF test
      fileTypes: "xml",
      downloadPath: "/tmp/invoice_downloads",
      xmlPath: "/tmp/xml_invoices", 
      pdfPath: "/tmp/pdf_invoices",
      headless: false,
      configId: 19
    };
    
    // Directly run the Python RPA service with XML configuration
    const pythonCommand = 'python3';
    const pythonArgs = [
      'server/services/pythonRpaService.py',
      JSON.stringify(config)
    ];
    
    console.log('🔧 Executing XML import for comparison:', pythonCommand, pythonArgs.join(' '));
    
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
      console.log('📄 [XML STDOUT]:', output.trim());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log('⚠️ [XML STDERR]:', output.trim());
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`🔧 XML process exited with code: ${code}`);
      console.log('\n📊 XML IMPORT COMPARISON SUMMARY:');
      console.log('=== XML STDOUT ===');
      console.log(stdout);
      console.log('=== XML STDERR ===');
      console.log(stderr);
    });
    
    pythonProcess.on('error', (error) => {
      console.error('❌ XML process error:', error);
    });
    
    // Wait for process to complete with shorter timeout for comparison
    await new Promise((resolve, reject) => {
      pythonProcess.on('close', resolve);
      pythonProcess.on('error', reject);
      
      // Timeout after 3 minutes for comparison
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('XML process timeout - but login might have succeeded'));
      }, 180000);
    });
    
  } catch (error) {
    console.error('❌ XML import test failed:', error);
  }
}

// Run the test
testXMLImport().then(() => {
  console.log('🔧 XML comparison test completed');
  process.exit(0);
}).catch((error) => {
  console.error('❌ XML comparison test error:', error);
  process.exit(1);
});