from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean, Table, Index
from sqlalchemy.orm import relationship, backref, object_session
from datetime import datetime
from .database import Base
from .security import EncryptedType

# Association table for member tags
member_tags = Table('member_tags', Base.metadata,
    Column('member_id', Integer, ForeignKey('members.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    role = Column(String, default="user") # admin, user
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    
    # Encrypted PII
    first_name = Column(EncryptedType)
    middle_name = Column(EncryptedType, nullable=True)
    last_name = Column(EncryptedType)
    
    # Searchable blind index for exact matches
    email_hash = Column(String, index=True, nullable=True)
    
    nationbuilder_id = Column(Integer, unique=True, index=True)
    
    # Contact fields (Encrypted)
    email = Column(EncryptedType, nullable=True)
    phone = Column(EncryptedType, nullable=True)
    mobile = Column(EncryptedType, nullable=True)
    
    # Address fields (Encrypted)
    primary_address1 = Column(EncryptedType)
    primary_address2 = Column(EncryptedType, nullable=True)
    primary_address3 = Column(EncryptedType, nullable=True)
    primary_city = Column(EncryptedType)
    primary_state = Column(String) # State is not PII, keep unencrypted for filtering
    primary_zip = Column(String) # Postcode is low sensitivity, keep unencrypted for filtering
    primary_country_code = Column(String, default="AU")
    
    # Membership fields
    membership_status = Column(String, default="active")  # active, lapsed, suspended
    join_date = Column(DateTime, nullable=True)
    renewal_date = Column(DateTime, nullable=True)
    membership_type = Column(String, nullable=True)  # e.g., full, supporter, associate
    resignation_date = Column(DateTime, nullable=True)
    
    # System fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_duplicate = Column(Boolean, default=False)
    duplicate_of_id = Column(Integer, ForeignKey('members.id'), nullable=True)
    last_synced_at = Column(DateTime, nullable=True)
    party_id = Column(Integer, ForeignKey('parties.id'), nullable=True)
    custom_attributes = Column(Text, default="{}") # JSON string for flexible fields
    
    # Relationships
    check_results = relationship("CheckResult", back_populates="member", cascade="all, delete-orphan", order_by="CheckResult.id")
    notes = relationship("MemberNote", back_populates="member", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=member_tags, back_populates="members")
    duplicate_of = relationship("Member", remote_side=[id], foreign_keys=[duplicate_of_id])
    party = relationship("Party", back_populates="members")
    
    interactions = relationship("Interaction", back_populates="member", cascade="all, delete-orphan")
    relationships_out = relationship("Relationship", foreign_keys="Relationship.from_member_id", back_populates="from_member", cascade="all, delete-orphan")
    relationships_in = relationship("Relationship", foreign_keys="Relationship.to_member_id", back_populates="to_member", cascade="all, delete-orphan")

    @property
    def dob(self) -> str | None:
        """Dynamically fetch Date of Birth from linked ERA record if verified."""
        if not self.check_results:
            return None
            
        last_check = self.check_results[-1]
        
        # We only care about passes or partials
        if last_check.result not in ["Pass", "Partial"]:
            return None
            
        session = object_session(self)
        if not session:
            return None

        from .era_models import ERAMatch, ERARecord
        
        # Find the highest scoring match for this member
        match = session.query(ERAMatch, ERARecord.date_of_birth).join(
            ERARecord, ERAMatch.era_record_id == ERARecord.id
        ).filter(
            ERAMatch.member_id == self.id
        ).order_by(ERAMatch.overall_score.desc()).first()

        if match and match.date_of_birth:
            return match.date_of_birth
            
        return None

class CheckResult(Base):
    __tablename__ = "check_results"
    __table_args__ = (
        Index('ix_check_results_member_id_id', 'member_id', 'id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    
    result = Column(String)  # Pass, Fail, Partial, etc.
    federal_division = Column(String, nullable=True)
    state_division = Column(String, nullable=True)
    local_government = Column(String, nullable=True)
    local_ward = Column(String, nullable=True)
    
    # Verification method: 'era' or 'browser' 
    verification_method = Column(String, nullable=True, default='browser')
    
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    member = relationship("Member", back_populates="check_results")


class MemberNote(Base):
    __tablename__ = "member_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    
    note = Column(Text)
    created_by = Column(String)  # User who created the note
    created_at = Column(DateTime, default=datetime.utcnow)
    
    member = relationship("Member", back_populates="notes")


class Tag(Base):
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    color = Column(String, default="#3B82F6")  # Hex color for UI
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    members = relationship("Member", secondary=member_tags, back_populates="tags")

class Party(Base):
    __tablename__ = "parties"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String) # Federal, State, Branch
    parent_id = Column(Integer, ForeignKey('parties.id'), nullable=True)
    
    members = relationship("Member", back_populates="party")
    children = relationship("Party", backref=backref("parent", remote_side=[id]))

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    action = Column(String) # LOGIN, EXPORT, MEMBER_UPDATE
    target_type = Column(String) # MEMBER, SYSTEM
    target_id = Column(Integer, nullable=True)
    details = Column(Text) # JSON string
    timestamp = Column(DateTime, default=datetime.utcnow)
    ip_address = Column(String, nullable=True)
    
    user = relationship("User")

class SavedSearch(Base):
    __tablename__ = "saved_searches"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    filters = Column(Text) # JSON string of filters
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User")

class Interaction(Base):
    __tablename__ = "interactions"
    
    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    type = Column(String)  # email, call, donation, meeting, system, note
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(Text)  # JSON string
    remote_id = Column(String, nullable=True)  # ID in external system (e.g. Stripe, SendGrid)
    created_by = Column(String, nullable=True) # User or System
    
    member = relationship("Member", back_populates="interactions")

class Relationship(Base):
    __tablename__ = "relationships"
    
    id = Column(Integer, primary_key=True, index=True)
    from_member_id = Column(Integer, ForeignKey("members.id"))
    to_member_id = Column(Integer, ForeignKey("members.id"))
    type = Column(String)  # spouse, parent, child, colleague, friend
    strength = Column(Integer, nullable=True)  # 1-5 scale
    
    from_member = relationship("Member", foreign_keys=[from_member_id], back_populates="relationships_out")
    to_member = relationship("Member", foreign_keys=[to_member_id], back_populates="relationships_in")
