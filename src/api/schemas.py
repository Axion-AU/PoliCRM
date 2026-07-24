from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime

class CheckResultBase(BaseModel):
    result: str
    federal_division: Optional[str] = None
    state_division: Optional[str] = None
    local_government: Optional[str] = None
    local_ward: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class TagBase(BaseModel):
    name: str
    color: str = "#3B82F6"
    description: Optional[str] = None

class TagCreate(TagBase):
    pass

class TagResponse(TagBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class MemberNoteBase(BaseModel):
    note: str
    created_by: str = "System"

class MemberNoteCreate(MemberNoteBase):
    pass

class MemberNoteResponse(MemberNoteBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class MemberBase(BaseModel):
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    nationbuilder_id: int
    email: Optional[str] = None  # Changed from EmailStr to str to allow empty strings
    phone: Optional[str] = None
    mobile: Optional[str] = None
    primary_address1: str
    primary_address2: Optional[str] = None
    primary_address3: Optional[str] = None
    primary_city: str
    primary_state: str
    primary_zip: str
    primary_country_code: str = "AU"
    membership_status: str = "active"
    membership_type: Optional[str] = None
    join_date: Optional[datetime] = None
    renewal_date: Optional[datetime] = None
    resignation_date: Optional[datetime] = None

class MemberCreate(MemberBase):
    pass

class PartyBase(BaseModel):
    name: str
    type: str

class PartyResponse(PartyBase):
    id: int
    
    class Config:
        from_attributes = True

class MemberUpdate(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    primary_address1: Optional[str] = None
    primary_city: Optional[str] = None
    primary_state: Optional[str] = None
    primary_zip: Optional[str] = None
    membership_status: Optional[str] = None
    membership_type: Optional[str] = None
    renewal_date: Optional[datetime] = None
    resignation_date: Optional[datetime] = None
    party_id: Optional[int] = None
    custom_attributes: Optional[str] = None # JSON string



class InteractionBase(BaseModel):
    type: str
    timestamp: datetime
    details: str
    remote_id: Optional[str] = None
    created_by: Optional[str] = None

class InteractionCreate(InteractionBase):
    pass

class InteractionResponse(InteractionBase):
    id: int
    
    class Config:
        from_attributes = True

class RelationshipBase(BaseModel):
    to_member_id: int
    type: str
    strength: Optional[int] = None

class RelationshipCreate(RelationshipBase):
    pass

class RelationshipResponse(RelationshipBase):
    id: int
    
    class Config:
        from_attributes = True

# Update MemberResponse to include new fields
class MemberResponse(MemberBase):
    id: int
    created_at: datetime
    updated_at: datetime
    is_duplicate: bool = False
    custom_attributes: str = "{}"
    dob: Optional[str] = None
    
    @field_validator('custom_attributes', mode='before')
    @classmethod
    def set_default_custom_attributes(cls, v):
        return v or "{}"

    check_results: List[CheckResultBase] = []
    notes: List[MemberNoteResponse] = []
    tags: List[TagResponse] = []
    party: Optional[PartyResponse] = None
    interactions: List[InteractionResponse] = []
    relationships_out: List[RelationshipResponse] = []
    relationships_in: List[RelationshipResponse] = []

    class Config:
        from_attributes = True

class PaginatedMemberResponse(BaseModel):
    members: List[MemberResponse]
    total: int
    skip: int
    limit: int
