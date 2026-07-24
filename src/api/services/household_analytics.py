"""
Household Analytics Service

Provides household-level analytics for campaign intelligence:
- Household penetration rates (members / electors)
- Conversion tier classification
- Advocate scoring (members who convert their households)
- Top converting households for volunteer recruitment

OPTIMIZED v2: Uses batch queries - loads all ERA data for member postcodes once,
then processes entirely in memory. Only 2-3 database queries total.
"""
import re
import logging
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict
import time

from ..era_models import ERARecord
from ..models import Member

logger = logging.getLogger(__name__)


@dataclass
class HouseholdStats:
    """Aggregated household statistics."""
    total_households_with_members: int
    total_electors_in_member_households: int
    total_members_matched: int
    average_conversion_rate: float
    tier_breakdown: Dict[str, int]  # '0%', '1-49%', '50-99%', '100%'


@dataclass
class HouseholdDetail:
    """Details about a specific household."""
    household_id: str
    address: str
    locality: str
    postcode: str
    federal_division: str
    total_electors: int
    member_count: int
    conversion_rate: float
    conversion_tier: str
    member_names: List[str]
    first_member_join: Optional[str]
    latest_member_join: Optional[str]


def normalize_address(address: str) -> str:
    """Normalize an address string for household grouping."""
    if not address:
        return ""
    
    addr = address.lower().strip()
    addr = re.sub(r'^(unit|flat|apt|apartment|suite)\s*', '', addr)
    
    replacements = {
        r'\bstreet\b': 'st', r'\broad\b': 'rd', r'\bavenue\b': 'ave',
        r'\bdrive\b': 'dr', r'\bcourt\b': 'ct', r'\bcrescent\b': 'cres',
        r'\bparade\b': 'pde', r'\bhighway\b': 'hwy', r'\blane\b': 'ln',
        r'\bplace\b': 'pl', r'\bterrace\b': 'tce', r'\bclose\b': 'cl',
        r'\bcircuit\b': 'cct',
    }
    
    for pattern, replacement in replacements.items():
        addr = re.sub(pattern, replacement, addr)
    
    return re.sub(r'\s+', ' ', addr)


def get_household_id(address: str, postcode: str) -> str:
    """Generate a household identifier from address + postcode."""
    return f"{postcode}:{normalize_address(address)}"


def _get_address_key(address: str, postcode: str) -> str:
    """Create a key for grouping by address prefix."""
    if not address:
        return ""
    prefix = address[:20].lower() if len(address) > 20 else address.lower()
    return f"{postcode}:{prefix}"


def _build_era_index(db: Session, postcodes: set) -> Tuple[Dict[str, int], Dict[str, Any]]:
    """
    Build an in-memory index of ERA records for given postcodes.
    
    Returns:
        era_counts: Dict mapping (postcode:addr_prefix) -> count of electors
        era_samples: Dict mapping (postcode:addr_prefix) -> sample ERARecord for metadata
    
    This is the key optimization - ONE query to load all relevant ERA data.
    """
    if not postcodes:
        return {}, {}
    
    start = time.time()
    logger.info(f"Building ERA index for {len(postcodes)} postcodes...")
    
    # Load ERA records for all needed postcodes
    # We only need id, full_address, post_code, locality_name, federal_division
    era_records = db.query(
        ERARecord.id,
        ERARecord.full_address,
        ERARecord.post_code,
        ERARecord.locality_name,
        ERARecord.federal_division
    ).filter(
        ERARecord.post_code.in_(postcodes)
    ).all()
    
    logger.info(f"Loaded {len(era_records)} ERA records in {time.time() - start:.2f}s")
    
    # Group by address prefix in memory
    era_counts: Dict[str, int] = defaultdict(int)
    era_samples: Dict[str, Any] = {}
    
    for record in era_records:
        # Create key from first 20 chars of lowercase address + postcode
        addr_lower = record.full_address.lower() if record.full_address else ""
        addr_prefix = addr_lower[:20] if len(addr_lower) > 20 else addr_lower
        key = f"{record.post_code}:{addr_prefix}"
        
        era_counts[key] += 1
        
        # Store first record as sample for metadata
        if key not in era_samples:
            era_samples[key] = {
                'full_address': record.full_address,
                'locality_name': record.locality_name,
                'post_code': record.post_code,
                'federal_division': record.federal_division
            }
    
    logger.info(f"Indexed {len(era_counts)} unique address groups in {time.time() - start:.2f}s")
    
    return dict(era_counts), era_samples


def _build_member_households(db: Session) -> Tuple[Dict[str, Dict], set]:
    """
    Load all members and group by household.
    
    Returns:
        household_members: Dict mapping addr_key -> {members, postcode, address, addr_prefix}
        postcodes: Set of all postcodes that have members
    """
    start = time.time()
    
    members_with_addresses = db.query(Member).filter(
        Member.primary_zip.isnot(None),
        Member.primary_address1.isnot(None)
    ).all()
    
    logger.info(f"Loaded {len(members_with_addresses)} members in {time.time() - start:.2f}s")
    
    if not members_with_addresses:
        return {}, set()
    
    household_members: Dict[str, Dict] = {}
    postcodes = set()
    
    for member in members_with_addresses:
        postcode = member.primary_zip
        address = member.primary_address1
        postcodes.add(postcode)
        
        addr_prefix = address[:20].lower() if len(address) > 20 else address.lower()
        addr_key = f"{postcode}:{addr_prefix}"
        
        if addr_key not in household_members:
            household_members[addr_key] = {
                'members': [],
                'postcode': postcode,
                'address': address,
                'addr_prefix': addr_prefix
            }
        household_members[addr_key]['members'].append(member)
    
    logger.info(f"Found {len(household_members)} unique households from {len(members_with_addresses)} members")
    
    return household_members, postcodes


def get_household_stats(db: Session) -> HouseholdStats:
    """
    Calculate aggregate household conversion statistics.
    OPTIMIZED: Uses batch-loaded ERA index - only 2 DB queries total.
    """
    start = time.time()
    logger.info("Calculating household stats (optimized v2)...")
    
    # Step 1: Load all members and group by household
    household_members, postcodes = _build_member_households(db)
    
    if not household_members:
        return HouseholdStats(
            total_households_with_members=0,
            total_electors_in_member_households=0,
            total_members_matched=0,
            average_conversion_rate=0,
            tier_breakdown={'0%': 0, '1-49%': 0, '50-99%': 0, '100%': 0}
        )
    
    # Step 2: Build ERA index for all relevant postcodes (ONE query)
    era_counts, _ = _build_era_index(db, postcodes)
    
    # Step 3: Calculate stats entirely in memory
    households_with_members = 0
    total_electors_at_matched = 0
    total_members_found = 0
    tier_counts = {'0%': 0, '1-49%': 0, '50-99%': 0, '100%': 0}
    conversion_rates = []
    
    for addr_key, household in household_members.items():
        member_count = len(household['members'])
        elector_count = era_counts.get(addr_key, 0)
        
        if elector_count > 0:
            households_with_members += 1
            total_electors_at_matched += elector_count
            total_members_found += member_count
            
            rate = min(member_count / elector_count, 1.0) * 100
            conversion_rates.append(rate)
            
            if rate >= 100:
                tier_counts['100%'] += 1
            elif rate >= 50:
                tier_counts['50-99%'] += 1
            elif rate > 0:
                tier_counts['1-49%'] += 1
    
    avg_rate = sum(conversion_rates) / len(conversion_rates) if conversion_rates else 0
    
    logger.info(f"Household stats complete in {time.time() - start:.2f}s: {households_with_members} households, {avg_rate:.1f}% avg rate")
    
    return HouseholdStats(
        total_households_with_members=households_with_members,
        total_electors_in_member_households=total_electors_at_matched,
        total_members_matched=total_members_found,
        average_conversion_rate=round(avg_rate, 1),
        tier_breakdown=tier_counts
    )


def get_member_household(db: Session, member_id: int) -> Optional[HouseholdDetail]:
    """Get household details for a specific member."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member or not member.primary_zip or not member.primary_address1:
        return None
    
    postcode = member.primary_zip
    address = member.primary_address1
    addr_prefix = address[:20].lower() if len(address) > 20 else address.lower()
    addr_key = f"{postcode}:{addr_prefix}"
    
    # Build ERA index for just this postcode
    era_counts, era_samples = _build_era_index(db, {postcode})
    
    elector_count = era_counts.get(addr_key, 0)
    era_sample = era_samples.get(addr_key)
    
    if elector_count == 0 or not era_sample:
        return None
    
    # Find all members at this address
    all_members_in_postcode = db.query(Member).filter(
        Member.primary_zip == postcode,
        Member.primary_address1.isnot(None)
    ).all()
    
    members_at_address = [
        m for m in all_members_in_postcode 
        if m.primary_address1 and addr_prefix in m.primary_address1.lower()
    ]
    
    member_count = len(members_at_address)
    rate = min(member_count / elector_count, 1.0) * 100
    
    if rate >= 100:
        tier = 'Full Conversion'
    elif rate >= 50:
        tier = 'Majority'
    elif rate > 0:
        tier = 'Partial'
    else:
        tier = 'None'
    
    join_dates = [m.created_at for m in members_at_address if m.created_at]
    first_join = min(join_dates).isoformat() if join_dates else None
    latest_join = max(join_dates).isoformat() if join_dates else None
    
    household_id = get_household_id(era_sample['full_address'], era_sample['post_code'])
    
    return HouseholdDetail(
        household_id=household_id,
        address=era_sample['full_address'],
        locality=era_sample['locality_name'] or '',
        postcode=era_sample['post_code'],
        federal_division=era_sample['federal_division'] or '',
        total_electors=elector_count,
        member_count=member_count,
        conversion_rate=round(rate, 1),
        conversion_tier=tier,
        member_names=[f"{m.first_name} {m.last_name}" for m in members_at_address],
        first_member_join=first_join,
        latest_member_join=latest_join
    )


def get_top_converting_households(db: Session, limit: int = 20, min_electors: int = 2) -> List[Dict[str, Any]]:
    """
    Get households with highest conversion rates.
    OPTIMIZED: Uses batch-loaded ERA index - only 2 DB queries total.
    """
    start = time.time()
    logger.info(f"Getting top converting households (limit={limit}, min_electors={min_electors})...")
    
    # Step 1: Load all members and group by household
    household_members, postcodes = _build_member_households(db)
    
    if not household_members:
        return []
    
    # Step 2: Build ERA index for all relevant postcodes (ONE query)
    era_counts, era_samples = _build_era_index(db, postcodes)
    
    # Step 3: Build household list entirely in memory
    households = []
    
    for addr_key, household in household_members.items():
        member_count = len(household['members'])
        elector_count = era_counts.get(addr_key, 0)
        era_sample = era_samples.get(addr_key)
        
        if elector_count < min_electors or not era_sample:
            continue
        
        rate = min(member_count / elector_count, 1.0) * 100
        
        households.append({
            'address': era_sample['full_address'],
            'locality': era_sample['locality_name'],
            'postcode': era_sample['post_code'],
            'federal_division': era_sample['federal_division'],
            'total_electors': elector_count,
            'member_count': member_count,
            'conversion_rate': round(rate, 1),
            'member_names': [f"{m.first_name} {m.last_name}" for m in household['members']]
        })
    
    # Sort by conversion rate (desc), then by member count (desc)
    households.sort(key=lambda x: (x['conversion_rate'], x['member_count']), reverse=True)
    
    logger.info(f"Returning top {min(limit, len(households))} households in {time.time() - start:.2f}s")
    
    return households[:limit]


def get_high_converting_members(db: Session, min_rate: float = 50.0, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Find members whose households have high conversion rates.
    OPTIMIZED: Reuses household data from get_top_converting_households.
    """
    logger.info(f"Getting high converting members (min_rate={min_rate}%, limit={limit})...")
    
    # Get top converting households (already optimized)
    top_households = get_top_converting_households(db, limit=200, min_electors=2)
    
    # Filter to those meeting min rate and extract members
    advocates = []
    seen_member_names = set()
    
    for household in top_households:
        if household['conversion_rate'] < min_rate:
            continue
        
        for member_name in household['member_names']:
            if member_name in seen_member_names:
                continue
            seen_member_names.add(member_name)
            
            advocates.append({
                'member_id': 0,
                'member_name': member_name,
                'email': None,
                'phone': None,
                'household_address': household['address'],
                'household_conversion_rate': household['conversion_rate'],
                'household_size': household['total_electors'],
                'members_converted': household['member_count'],
                'federal_division': household['federal_division']
            })
            
            if len(advocates) >= limit:
                break
        
        if len(advocates) >= limit:
            break
    
    logger.info(f"Found {len(advocates)} advocate candidates")
    
    return advocates
