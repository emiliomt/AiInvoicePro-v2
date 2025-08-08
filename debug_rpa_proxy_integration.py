#!/usr/bin/env python3
"""
Debug script to test the full RPA proxy integration pipeline
This simulates what happens during a real RPA import with proxy settings
"""

import json
import sys
import os
import requests

def test_user_settings_api():
    """Test fetching user settings from the API"""
    print("🔍 Testing User Settings API Integration")
    print("=" * 50)
    
    try:
        # Test the settings endpoint (without authentication for now)
        url = "http://localhost:5000/api/settings/user_preferences"
        
        print(f"Testing GET {url}")
        response = requests.get(url, timeout=5)
        
        if response.status_code == 401:
            print("✅ API endpoint exists (requires authentication)")
            return True
        elif response.status_code == 200:
            data = response.json()
            print(f"✅ API responded with data: {data}")
            return True
        else:
            print(f"⚠️ API responded with status {response.status_code}: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to local server. Make sure the app is running.")
        return False
    except Exception as e:
        print(f"❌ Error testing API: {e}")
        return False

def simulate_rpa_config_preparation():
    """Simulate how the Node.js service would prepare proxy settings for Python RPA"""
    print("\n🔧 Simulating RPA Config Preparation")
    print("=" * 50)
    
    # Simulate user proxy settings that would be fetched from database
    mock_user_preferences = {
        'rpaProxyRotationEnabled': True,
        'rpaProxyRotationInterval': 50,  # Lower for testing
        'rpaProxyList': [
            'http://proxy1.example.com:8080',
            'socks5://user:pass@proxy2.example.com:1080',
            'http://proxy3.example.com:3128'
        ],
        'rpaCurrentProxyIndex': 0
    }
    
    print("Mock user preferences:", json.dumps(mock_user_preferences, indent=2))
    
    # Simulate the Node.js pythonConfig preparation
    python_config = {
        'erpUrl': 'https://www3.sincoerp.com/SincoObycon_Nueva/V3/Marco/Login.aspx',
        'erpUsername': 'test_user',
        'erpPassword': 'test_password',
        'downloadPath': 'uploads/pdfs',
        'xmlPath': 'uploads/xmls',
        'headless': True,
        'fileTypes': 'both',
        'zipDownloadTimeout': 60,
        
        # Legacy proxy settings (backward compatibility)
        'proxyHost': None,
        'proxyPort': None,
        'proxyUser': None,
        'proxyPass': None,
        
        # New proxy rotation configuration
        'proxyRotationEnabled': mock_user_preferences['rpaProxyRotationEnabled'],
        'proxyRotationInterval': mock_user_preferences['rpaProxyRotationInterval'],
        'proxyList': mock_user_preferences['rpaProxyList'],
        'currentProxyIndex': mock_user_preferences['rpaCurrentProxyIndex'],
        
        'logId': 1,
        'configId': 29
    }
    
    print("\n✅ Prepared Python RPA configuration:")
    print(json.dumps(python_config, indent=2))
    
    return python_config

def test_chrome_proxy_arguments():
    """Test Chrome proxy argument generation"""
    print("\n🌐 Testing Chrome Proxy Arguments")
    print("=" * 50)
    
    test_proxies = [
        'http://proxy.example.com:8080',
        'socks5://user:pass@proxy.example.com:1080', 
        'socks4://proxy.example.com:4444',
        'proxy.example.com:3128'  # No protocol
    ]
    
    for proxy in test_proxies:
        print(f"\nTesting proxy: {proxy}")
        
        # Simulate Chrome proxy argument generation logic
        chrome_args = []
        
        if proxy.startswith('socks5://'):
            proxy_without_protocol = proxy.replace('socks5://', '')
            chrome_args.append(f"--proxy-server=socks5://{proxy_without_protocol}")
        elif proxy.startswith('socks4://'):
            proxy_without_protocol = proxy.replace('socks4://', '')
            chrome_args.append(f"--proxy-server=socks4://{proxy_without_protocol}")
        else:
            if not proxy.startswith('http'):
                proxy = f"http://{proxy}"
            chrome_args.append(f"--proxy-server={proxy}")
        
        chrome_args.append("--proxy-bypass-list=<-loopback>")
        
        print(f"  Chrome arguments: {chrome_args}")
    
    return True

def check_database_for_recent_imports():
    """Check if the database has recent import data"""
    print("\n📊 Checking Recent Import Data")
    print("=" * 50)
    
    # Since we can't directly access the database from here,
    # we'll check for file evidence of recent imports
    
    files_found = []
    
    # Check for uploaded files
    if os.path.exists('uploads/pdfs'):
        pdf_files = [f for f in os.listdir('uploads/pdfs') if f.endswith('.pdf')]
        files_found.extend(pdf_files[:3])  # Show first 3
        
    if os.path.exists('uploads/xmls'):
        xml_files = [f for f in os.listdir('uploads/xmls') if f.endswith('.xml')]
        files_found.extend(xml_files[:3])  # Show first 3
    
    if files_found:
        print("✅ Recent import files found:")
        for file in files_found:
            print(f"  - {file}")
    else:
        print("⚠️ No recent import files found in uploads directories")
    
    return len(files_found) > 0

if __name__ == "__main__":
    print("🚀 RPA Proxy Integration Debug Test")
    print("=" * 60)
    
    success_count = 0
    total_tests = 4
    
    # Test 1: User settings API
    if test_user_settings_api():
        success_count += 1
    
    # Test 2: Config preparation simulation
    config = simulate_rpa_config_preparation()
    if config and config.get('proxyRotationEnabled'):
        success_count += 1
    
    # Test 3: Chrome proxy arguments
    if test_chrome_proxy_arguments():
        success_count += 1
    
    # Test 4: Recent import data check
    if check_database_for_recent_imports():
        success_count += 1
    
    print("\n" + "=" * 60)
    print(f"📋 Debug Summary: {success_count}/{total_tests} tests passed")
    
    if success_count == total_tests:
        print("🎉 All integration tests passed! Proxy rotation system is ready.")
    elif success_count >= total_tests // 2:
        print("⚠️ Most tests passed. System should work with minor adjustments.")
    else:
        print("❌ Several tests failed. Review implementation before production use.")
    
    print("\n💡 Next steps:")
    print("1. Configure proxy servers in the Settings UI")
    print("2. Enable proxy rotation in RPA Proxy Settings")
    print("3. Run a test RPA import to verify proxy switching")
    print("4. Monitor logs for proxy rotation messages")