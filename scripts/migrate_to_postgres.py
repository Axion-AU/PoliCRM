#!/usr/bin/env python3
"""
Migrate data from SQLite to PostgreSQL.
Run with: python scripts/migrate_to_postgres.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Source: SQLite
SQLITE_URL = "sqlite:///./crm.db"

# Target: PostgreSQL
POSTGRES_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://policrm:policrm_dev_2024@localhost:5432/policrm'
)

print(f"Source: {SQLITE_URL}")
print(f"Target: {POSTGRES_URL}")

# Create engines
sqlite_engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
postgres_engine = create_engine(POSTGRES_URL)

SqliteSession = sessionmaker(bind=sqlite_engine)
PostgresSession = sessionmaker(bind=postgres_engine)

# Import models to create tables
from src.api.models import Base, Member, User, CheckResult, MemberNote, Tag, Party, AuditLog, SavedSearch
from src.api.era_models import ERAUpload, ERARecord, ERAMatch

print("\nCreating tables in PostgreSQL...")
Base.metadata.create_all(bind=postgres_engine)
print("Tables created!")

# Tables to migrate in order (respecting foreign keys)
TABLES = [
    ('users', User),
    ('parties', Party),
    ('tags', Tag),
    ('members', Member),
    ('check_results', CheckResult),
    ('member_notes', MemberNote),
    ('audit_logs', AuditLog),
    ('saved_searches', SavedSearch),
    ('era_uploads', ERAUpload),
    ('era_records', ERARecord),
    ('era_matches', ERAMatch),
]

def migrate_table(table_name: str, model_class, batch_size: int = 10000):
    """Migrate a single table from SQLite to PostgreSQL."""
    sqlite_session = SqliteSession()
    postgres_session = PostgresSession()
    
    try:
        # Count source records
        count = sqlite_session.query(model_class).count()
        print(f"\nMigrating {table_name}: {count:,} records...")
        
        if count == 0:
            print(f"  Skipping (empty)")
            return
        
        # Migrate in batches
        offset = 0
        migrated = 0
        
        while offset < count:
            records = sqlite_session.query(model_class).offset(offset).limit(batch_size).all()
            
            for record in records:
                # Detach from SQLite session and merge into PostgreSQL
                sqlite_session.expunge(record)
                postgres_session.merge(record)
            
            postgres_session.commit()
            migrated += len(records)
            offset += batch_size
            
            print(f"  Progress: {migrated:,}/{count:,} ({100*migrated/count:.1f}%)")
        
        print(f"  Done: {migrated:,} records migrated")
        
    except Exception as e:
        print(f"  ERROR: {e}")
        postgres_session.rollback()
    finally:
        sqlite_session.close()
        postgres_session.close()

def main():
    print("\n" + "="*60)
    print("SQLite to PostgreSQL Migration")
    print("="*60)
    
    for table_name, model_class in TABLES:
        migrate_table(table_name, model_class)
    
    print("\n" + "="*60)
    print("Migration complete!")
    print("="*60)

if __name__ == "__main__":
    main()
