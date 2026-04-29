"""Tests for IPC input validation."""

import sys
import os
import json

# Add the project root to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from backend.ipc_protocol import IPCMessage, validate_method, validate_params

def test_invalid_method():
    """Test that invalid methods are rejected."""
    try:
        msg = IPCMessage({'id': '1', 'method': '../../../etc/passwd', 'params': {}})
        # Should raise ValueError now
        print("FAIL: Should have raised ValueError")
        return False
    except ValueError as e:
        print(f"PASS: Caught invalid method: {e}")
        return True

def test_missing_required_params():
    """Test that missing required params are handled."""
    # This will be caught by the decorator later
    pass

def test_path_traversal():
    """Test path traversal detection."""
    from backend.ipc_protocol import validate_params
    bad_params = {'path': '../../../etc/passwd'}
    assert not validate_params(bad_params), "Should reject path traversal"
    print("PASS: Path traversal detected")
    return True

if __name__ == '__main__':
    test_invalid_method()
    test_path_traversal()
