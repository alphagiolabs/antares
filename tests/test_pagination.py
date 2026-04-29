import sys
sys.path.insert(0, '.')

from backend.core.history import save_run, list_runs, _ensure_table
from backend.core.database import get_db_path
import sqlite3

def setup():
    """Clear history table for testing."""
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.execute("DELETE FROM historial")
        conn.commit()

def test_pagination():
    """Test that list_runs supports offset."""
    setup()
    
    # Save some test runs
    for i in range(10):
        save_run(
            files=[f"file{i}.jpg"],
            options={"formato": "JPEG"},
            patron="test",
            formato="JPEG",
            calidad=95,
            resize=None,
            ok_count=1,
            err_count=0,
        )
    
    # Get first page
    page1 = list_runs(limit=5, offset=0)
    assert len(page1) == 5, f"Expected 5, got {len(page1)}"
    
    # Get second page
    page2 = list_runs(limit=5, offset=5)
    assert len(page2) == 5, f"Expected 5, got {len(page2)}"
    
    # Verify different results
    assert page1[0]['id'] != page2[0]['id'], "Pages should have different results"
    
    print("Pagination test passed!")

if __name__ == '__main__':
    test_pagination()
