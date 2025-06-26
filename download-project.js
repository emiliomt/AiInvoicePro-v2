
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function createProjectZip() {
  const output = fs.createWriteStream('project-files.zip');
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  // Listen for all archive data to be written
  output.on('close', function() {
    console.log(`Project zip created: ${archive.pointer()} total bytes`);
    console.log('Download: project-files.zip');
  });

  // Good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.warn(err);
    } else {
      throw err;
    }
  });

  // Good practice to catch this error explicitly
  archive.on('error', function(err) {
    throw err;
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add client directory
  archive.directory('client/', 'client/');
  
  // Add server directory
  archive.directory('server/', 'server/');
  
  // Add shared directory
  archive.directory('shared/', 'shared/');
  
  // Add important config files
  archive.file('package.json', { name: 'package.json' });
  archive.file('package-lock.json', { name: 'package-lock.json' });
  archive.file('tsconfig.json', { name: 'tsconfig.json' });
  archive.file('tailwind.config.ts', { name: 'tailwind.config.ts' });
  archive.file('postcss.config.js', { name: 'postcss.config.js' });
  archive.file('components.json', { name: 'components.json' });
  archive.file('drizzle.config.ts', { name: 'drizzle.config.ts' });
  archive.file('vite.config.ts', { name: 'vite.config.ts' });
  archive.file('replit.md', { name: 'replit.md' });
  
  // Add migrations
  archive.directory('migrations/', 'migrations/');

  // Finalize the archive
  await archive.finalize();
}

createProjectZip().catch(console.error);
