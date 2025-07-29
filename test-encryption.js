// Test script to verify password encryption/decryption
const testPassword = "mySecretPassword123!";

console.log("🔐 Testing password encryption/decryption...");
console.log(`🔐 Original password: ${testPassword}`);

// Encrypt (same as in server/routes.ts)
const encryptedPassword = Buffer.from(testPassword).toString('base64');
console.log(`🔐 Encrypted password: ${encryptedPassword}`);
console.log(`🔐 Encrypted length: ${encryptedPassword.length}`);

// Decrypt (same as in server/routes.ts)
const decryptedPassword = Buffer.from(encryptedPassword, 'base64').toString('utf8');
console.log(`🔐 Decrypted password: ${decryptedPassword}`);
console.log(`🔐 Decrypted length: ${decryptedPassword.length}`);

// Check if they match
const matches = testPassword === decryptedPassword;
console.log(`🔐 Encryption/decryption test passed: ${matches}`);

if (!matches) {
  console.error("🔐 ERROR: Encryption/decryption test failed!");
} else {
  console.log("🔐 SUCCESS: Encryption/decryption is working correctly");
}

// Test with various character types
const testPasswords = [
  "simple123",
  "P@ssw0rd!",
  "ñáéíóú_special",
  "MyPassword123#",
  "admin_2024"
];

console.log("\n🔐 Testing various password types:");
testPasswords.forEach((pwd, index) => {
  const encrypted = Buffer.from(pwd).toString('base64');
  const decrypted = Buffer.from(encrypted, 'base64').toString('utf8');
  const success = pwd === decrypted;
  console.log(`Test ${index + 1}: ${pwd} → ${encrypted} → ${decrypted} [${success ? 'PASS' : 'FAIL'}]`);
});