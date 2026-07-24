from .worker_pool import BrowserPool
from .database import get_db
from .auth import verify_firebase_token, get_current_active_user, get_current_admin_user

# Initialize Verification Pool globally
# Split architecture: N fast ERA workers + 1 rate-limited browser worker
browser_pool = BrowserPool(era_workers=4, headless=True)
