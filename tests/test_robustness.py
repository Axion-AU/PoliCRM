import sys
import os
import logging
import unittest
from unittest.mock import MagicMock, patch
from sqlalchemy.exc import OperationalError
from fastapi.testclient import TestClient
from fastapi import FastAPI

# Add src to path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from api.database import retry_on_lock
from api.main import app

# Configure logging to capture output
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TestRobustness(unittest.TestCase):
    def test_retry_on_lock(self):
        """Test that the retry decorator retries on lock and eventually fails or succeeds."""
        logger.info("Testing retry_on_lock...")
        
        mock_func = MagicMock()
        # Side effect: raise OperationalError 3 times, then succeed
        mock_func.side_effect = [
            OperationalError("database is locked", None, None),
            OperationalError("database is locked", None, None),
            OperationalError("database is locked", None, None),
            "Success"
        ]
        
        @retry_on_lock(max_retries=5, delay=0.1)
        def decorated_func():
            return mock_func()
            
        result = decorated_func()
        self.assertEqual(result, "Success")
        self.assertEqual(mock_func.call_count, 4)
        logger.info("retry_on_lock passed!")

    def test_retry_on_lock_failure(self):
        """Test that it raises after max retries."""
        logger.info("Testing retry_on_lock failure...")
        
        mock_func = MagicMock()
        mock_func.side_effect = OperationalError("database is locked", None, None)
        
        @retry_on_lock(max_retries=3, delay=0.1)
        def decorated_func():
            return mock_func()
            
        with self.assertRaises(OperationalError):
            decorated_func()
            
        self.assertEqual(mock_func.call_count, 3)
        logger.info("retry_on_lock failure passed!")

    def test_api_exception_handling(self):
        """Test global exception handler."""
        logger.info("Testing API exception handling...")
        
        client = TestClient(app, raise_server_exceptions=False)
        
        # Define a route that raises an exception
        @app.get("/test-error")
        def test_error():
            raise ValueError("Something went wrong")
            
        response = client.get("/test-error")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Something went wrong", "message": "Internal Server Error"})
        logger.info("API exception handling passed!")

if __name__ == "__main__":
    unittest.main()
