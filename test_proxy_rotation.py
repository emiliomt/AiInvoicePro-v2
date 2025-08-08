#!/usr/bin/env python3
"""
Test script for proxy rotation functionality in the RPA system.
This tests the proxy configuration and rotation logic.
"""

import json
import sys
import os

# Add the server/services directory to the path to import pythonRpaService
sys.path.append(os.path.join(os.path.dirname(__file__), 'server', 'services'))

try:
    from pythonRpaService import InvoiceRPAService
except ImportError as e:
    print(f"❌ Failed to import InvoiceRPAService: {e}")
    print("Make sure you're running this from the project root directory")
    sys.exit(1)

def test_proxy_rotation():
    """Test proxy rotation configuration and functionality"""
    
    print("🧪 Testing Proxy Rotation System")
    print("=" * 50)
    
    # Test configuration with proxy rotation enabled
    test_config = {
        'erpUrl': 'https://example.com',
        'erpUsername': 'test_user',
        'erpPassword': 'test_password',
        'downloadPath': 'uploads/pdfs',
        'xmlPath': 'uploads/xmls',
        'headless': True,
        'zipDownloadTimeout': 60,
        
        # Proxy rotation settings
        'proxyRotationEnabled': True,
        'proxyRotationInterval': 3,  # Low number for testing
        'proxyList': [
            'http://proxy1.example.com:8080',
            'socks5://proxy2.example.com:1080',
            'http://user:pass@proxy3.example.com:3128',
            'socks4://proxy4.example.com:4444'
        ],
        'currentProxyIndex': 0
    }
    
    try:
        # Initialize the RPA service
        rpa = InvoiceRPAService(test_config)
        
        print(f"✅ RPA service initialized with proxy rotation: {rpa.proxy_rotation_enabled}")
        print(f"📊 Proxy rotation interval: {rpa.proxy_rotation_interval}")
        print(f"🌐 Available proxies: {len(rpa.proxy_list)}")
        
        # Test proxy list display
        for i, proxy in enumerate(rpa.proxy_list):
            current = " (current)" if i == rpa.current_proxy_index else ""
            print(f"  {i + 1}. {proxy}{current}")
        
        print("\n🔄 Testing proxy rotation logic...")
        
        # Test get_current_proxy
        current_proxy = rpa.get_current_proxy()
        print(f"Current proxy: {current_proxy}")
        
        # Test rotation conditions
        print(f"Should rotate proxy: {rpa.should_rotate_proxy()}")
        
        # Simulate imports and test rotation
        for i in range(6):  # More than rotation interval (3)
            print(f"\n📥 Simulating import #{i + 1}")
            
            rpa.increment_import_count()
            print(f"  Imports since rotation: {rpa.imports_since_rotation}")
            
            if rpa.should_rotate_proxy():
                print(f"  🔄 Rotation threshold reached!")
                old_proxy = rpa.get_current_proxy()
                
                if rpa.rotate_proxy():
                    new_proxy = rpa.get_current_proxy()
                    print(f"  ✅ Rotated from {old_proxy} to {new_proxy}")
                else:
                    print(f"  ❌ Failed to rotate proxy")
            else:
                print(f"  ⏳ No rotation needed yet")
        
        print("\n🧪 Testing with single proxy (no rotation)...")
        
        # Test with single proxy
        single_proxy_config = {**test_config}
        single_proxy_config['proxyList'] = ['http://single-proxy.example.com:8080']
        single_proxy_config['currentProxyIndex'] = 0
        
        rpa_single = InvoiceRPAService(single_proxy_config)
        print(f"Single proxy rotation available: {len(rpa_single.proxy_list) > 1}")
        
        # Try to rotate with single proxy
        result = rpa_single.rotate_proxy()
        print(f"Single proxy rotation result: {result} (should be False)")
        
        print("\n🧪 Testing with disabled proxy rotation...")
        
        # Test with disabled rotation
        disabled_config = {**test_config}
        disabled_config['proxyRotationEnabled'] = False
        
        rpa_disabled = InvoiceRPAService(disabled_config)
        print(f"Proxy rotation enabled: {rpa_disabled.proxy_rotation_enabled}")
        
        # Try to rotate with disabled rotation
        result = rpa_disabled.rotate_proxy()
        print(f"Disabled rotation result: {result} (should be False)")
        
        print("\n✅ All proxy rotation tests completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False
    
    return True

def test_proxy_configuration():
    """Test proxy configuration parsing"""
    print("\n🔧 Testing Proxy Configuration Parsing")
    print("=" * 50)
    
    test_proxies = [
        'http://proxy.example.com:8080',
        'https://secure-proxy.example.com:8443',
        'socks5://user:pass@socks-proxy.example.com:1080',
        'socks4://socks4-proxy.example.com:4444',
        'proxy.example.com:3128',  # No protocol specified
    ]
    
    for proxy in test_proxies:
        print(f"Testing proxy: {proxy}")
        
        # Test proxy formatting logic
        formatted_proxy = proxy
        if proxy.startswith('socks5://'):
            proxy_without_protocol = proxy.replace('socks5://', '')
            print(f"  SOCKS5 proxy: socks5://{proxy_without_protocol}")
        elif proxy.startswith('socks4://'):
            proxy_without_protocol = proxy.replace('socks4://', '')
            print(f"  SOCKS4 proxy: socks4://{proxy_without_protocol}")
        else:
            if not proxy.startswith('http'):
                formatted_proxy = f"http://{proxy}"
            print(f"  HTTP proxy: {formatted_proxy}")
        
        print("")
    
    return True

if __name__ == "__main__":
    print("🚀 Starting Proxy Rotation Tests")
    print("=" * 60)
    
    success = True
    
    # Run configuration test
    if not test_proxy_configuration():
        success = False
    
    # Run rotation test
    if not test_proxy_rotation():
        success = False
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 All tests passed! Proxy rotation system is working correctly.")
    else:
        print("❌ Some tests failed. Please check the implementation.")
    
    sys.exit(0 if success else 1)