import sys
import os
from sqlalchemy import create_engine, text

# Add src to path
sys.path.append(os.getcwd())

# Try to load .env
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("Loaded .env file")
except ImportError:
    print("python-dotenv not installed, using environment variables only")

from src.api.database import DATABASE_URL as SQLALCHEMY_DATABASE_URL

def deduplicate():
    print("Connecting to database...")
    # Mask password for printing
    masked_url = SQLALCHEMY_DATABASE_URL
    if ":" in masked_url and "@" in masked_url:
        import re
        masked_url = re.sub(r':([^@]+)@', ':****@', masked_url)
    print(f"Using Database: {masked_url}")

    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    
    print("Finding duplicates...")
    with engine.connect() as conn:
        # Check current count
        count = conn.execute(text("SELECT COUNT(*) FROM era_records")).scalar()
        print(f"Current records: {count}")
        
        if count == 0:
            print("Database is empty. Nothing to deduplicate.")
            return

        # Delete duplicates in batches to avoid locking
        print("Deleting duplicates in batches...")
        total_deleted = 0
        while True:
            # SQLite batch delete with NULL check
                DELETE FROM era_records
                WHERE id IN (
                    SELECT id FROM (
                        SELECT id,
                               ROW_NUMBER() OVER (
                                   PARTITION BY surname_normalized, given_names_normalized, full_address 
                                   ORDER BY id
                               ) as rn
                        FROM era_records
                        WHERE surname_normalized IS NOT NULL 
                          AND full_address IS NOT NULL
                    ) t
                    WHERE t.rn > 1
                    LIMIT 5000
                )
            
            # Also handle NULL transaction_number specifically if any?
            # Assuming valid records have transaction_number.
            
            try:
                result = conn.execute(sql)
                conn.commit()
                count = result.rowcount
                total_deleted += count
                print(f"Deleted batch of {count}. Total: {total_deleted}")
                
                if count == 0:
                    break
            except Exception as e:
                print(f"Error executing batch: {e}")
                import time
                time.sleep(1) # Wait for lock to clear
        
        print(f"Finished. Deleted {total_deleted} duplicate records.")
        
        new_count = conn.execute(text("SELECT COUNT(*) FROM era_records")).scalar()
        print(f"New record count: {new_count}")

if __name__ == "__main__":
    deduplicate()
