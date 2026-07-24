import sys
import os
import logging
from sqlalchemy import text

# Add src to path
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reset_era")

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

try:
    from src.api.database import engine, Base
    from src.api.era_models import ERARecord, ERAUpload, ERAMatch
    from src.api.models import User # Required for ForeignKey 'users.id'
except ImportError as e:
    logger.error(f"Import failed: {e}")
    logger.info("Make sure you are running this from the project root.")
    sys.exit(1)

def reset_tables():
    logger.info("Connecting to database...")
    with engine.connect() as conn:
        # Disable foreign key checks for SQLite to allow dropping tables irrespective of order
        # But for Postgres we must respect order or use CASCADE
        
        logger.info("Dropping ERA tables...")
        # Drop in reverse dependency order
        try:
            conn.execute(text("DROP TABLE IF EXISTS era_matches CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS era_records CASCADE"))
            conn.execute(text("DROP TABLE IF EXISTS era_uploads CASCADE"))
            logger.info("Dropped tables successfully.")
        except Exception as e:
            logger.warning(f"Error dropping tables (might be SQLite syntax diffs): {e}")
            # SQLite fallback
            conn.execute(text("DROP TABLE IF EXISTS era_matches"))
            conn.execute(text("DROP TABLE IF EXISTS era_records"))
            conn.execute(text("DROP TABLE IF EXISTS era_uploads"))

        conn.commit()

    logger.info("Recreating tables...")
    # Create all tables (will only create missing ones)
    # We need to make sure era_models are registered with Base
    Base.metadata.create_all(bind=engine)
    logger.info("Tables recreated successfully.")

if __name__ == "__main__":
    confirm = input("This will DELETE ALL ERA DATA. Are you sure? (y/n): ")
    if confirm.lower() == 'y':
        reset_tables()
    else:
        logger.info("Cancelled.")
