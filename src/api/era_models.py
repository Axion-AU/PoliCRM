"""
ERA (Electoral Roll Access) data models for SQLite storage.
Provides efficient storage and indexing for fuzzy search against electoral roll data.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class ERAUpload(Base):
    """Tracks ERA file uploads for batch management."""
    __tablename__ = "era_uploads"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    state = Column(String, index=True)  # V, N, Q, etc.
    record_count = Column(Integer, default=0)
    status = Column(String, default='pending')  # pending, parsing, complete, error
    error_message = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    uploaded_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    records = relationship("ERARecord", back_populates="upload", cascade="all, delete-orphan")


class ERARecord(Base):
    """
    Electoral Roll Access record following AEC data dictionary format.
    Optimized for fuzzy name and address matching.
    """
    __tablename__ = "era_records"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey('era_uploads.id'), nullable=True)
    
    # Transaction identifiers
    enrolment_state = Column(String(1))  # V, N, Q, etc.
    transaction_number = Column(String(8), index=True)  # 8-digit zero-padded
    federal_direct_indicator = Column(String(1))  # 1 or 0
    
    # Name fields - indexed for fuzzy search
    title = Column(String(10), nullable=True)
    given_names = Column(String(25), nullable=True)
    surname = Column(String(25), index=True)
    
    # Normalized name fields for efficient fuzzy matching
    surname_normalized = Column(String(25), index=True)  # lowercase, stripped
    given_names_normalized = Column(String(25), index=True)  # lowercase, stripped
    
    # Demographics
    date_of_birth = Column(String(10))  # DD/MM/YYYY format
    gender = Column(String(1))  # F, M, or blank
    
    # Address fields
    habitation_name = Column(String(25), nullable=True)
    flat_number = Column(String(6), nullable=True)
    street_number = Column(String(6), nullable=True)
    street_name = Column(String(25), nullable=True, index=True)
    street_type = Column(String(7), nullable=True)
    locality_name = Column(String(25), index=True)  # Suburb
    post_code = Column(String(4), index=True)
    state = Column(String(3))
    full_address = Column(String(108))
    enrolled_address_dpid = Column(String(8), nullable=True)
    
    # Geographic identifiers
    walk_number = Column(String(5), nullable=True)
    
    # Enrolment metadata
    enrolled_date = Column(String(10))
    eligibility_flag = Column(String(1), nullable=True)  # F, S, N, or blank
    gpv_indicator = Column(String(1), nullable=True)  # G or blank
    new_enrolment_flag = Column(String(1), nullable=True)  # F, R, X, or blank
    
    # Postal address
    postal_address = Column(String(57), nullable=True)
    postal_address_dpid = Column(String(8), nullable=True)
    
    # Electoral divisions
    federal_division = Column(String(25), index=True)
    federal_division_pre_redistribution = Column(String(25), nullable=True)
    state_district = Column(String(25), nullable=True, index=True)
    state_district_pre_redistribution = Column(String(25), nullable=True)
    local_government_area = Column(String(25), nullable=True)
    lga_pre_redistribution = Column(String(25), nullable=True)
    sa1 = Column(String(7), nullable=True)
    
    # Mailing fields
    mailing_name = Column(String(62), nullable=True)
    mailing_address_line1 = Column(String(40), nullable=True)
    mailing_address_line2 = Column(String(40), nullable=True)
    mailing_address_line3 = Column(String(40), nullable=True)
    mailing_address_line4 = Column(String(40), nullable=True)
    
    # Previous/Dual enrolment tracking
    prev_enrolment_state = Column(String(1), nullable=True)
    prev_transaction_number = Column(String(8), nullable=True)
    dual_enrolment_state = Column(String(1), nullable=True)
    dual_transaction_number = Column(String(8), nullable=True)
    
    # Relationship
    upload = relationship("ERAUpload", back_populates="records")

    __table_args__ = (
        # Deduplicate based on Name + Address (as requested)
        UniqueConstraint('surname_normalized', 'given_names_normalized', 'full_address', name='uq_era_name_address'),
    )


# Composite indexes for common search patterns
Index('idx_era_surname_locality', ERARecord.surname_normalized, ERARecord.locality_name)
Index('idx_era_postcode_surname', ERARecord.post_code, ERARecord.surname_normalized)
Index('idx_era_federal_division', ERARecord.federal_division, ERARecord.surname_normalized)


class ERAMatch(Base):
    """
    Stores fuzzy match results between CRM members and ERA records.
    Caches match results to avoid re-computation.
    """
    __tablename__ = "era_matches"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey('members.id'), index=True)
    era_record_id = Column(Integer, ForeignKey('era_records.id'), index=True)
    
    # Match scoring
    overall_score = Column(Integer)  # 0-100
    name_score = Column(Integer)  # 0-100
    address_score = Column(Integer)  # 0-100
    
    # Match status
    is_verified = Column(Integer, default=0)  # 1 = user verified match, 0 = pending
    matched_at = Column(DateTime, default=datetime.utcnow)
    verified_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    
    # Extracted electoral info from matched ERA record
    federal_division = Column(String(25), nullable=True)
    state_district = Column(String(25), nullable=True)
    local_government_area = Column(String(25), nullable=True)


Index('idx_era_match_member', ERAMatch.member_id, ERAMatch.overall_score.desc())
