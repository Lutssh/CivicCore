import psycopg2
import uuid
import datetime
import os
from argon2 import PasswordHasher

# Database connection
DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:Patherapardus@1@localhost:5432/civiccore")

SAFE_SET = [
    '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'C', 'E', 'F', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'T', 'V', 'W', 'X', 'Y',
]

def char_to_val(c):
    if c in SAFE_SET:
        return SAFE_SET.index(c)
    return ord(c) % 25

def compute_entropy(sequence):
    salt = 0x5A3B12
    # Scramble using 32-bit arithmetic equivalent
    scrambled = ((sequence + salt) * 0x9E3779B9) & 0xFFFFFFFF
    idx1 = scrambled % 25
    idx2 = (scrambled // 25) % 25
    return SAFE_SET[idx1] + SAFE_SET[idx2]

def compute_check(base):
    sum1 = 0
    sum2 = 0
    for i, c in enumerate(base):
        val = char_to_val(c)
        if i % 2 == 0:
            sum1 = (sum1 + val) % 25
        else:
            sum2 = (sum2 + val) % 25
    return SAFE_SET[sum1] + SAFE_SET[sum2]

def generate_citizen_id(sex, year, sequence):
    yy = str(year % 100).zfill(2)
    seq_str = str(sequence).zfill(4)
    entropy = compute_entropy(sequence)
    base = f"C{sex}{yy}{seq_str}{entropy}"
    check = compute_check(base)
    return base + check

ph = PasswordHasher()

def seed():
    conn = psycopg2.connect(
        dbname=os.environ.get("DB_NAME", "civiccore"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", "Patherapardus@1"),
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5432"))
    )
    cur = conn.cursor()

    # 1. Create Users
    accounts = [
        ("registrar@civiccore.demo", "Demo@2026", "CIVIL_REGISTRAR", "Martha Auma", "CIVIL_REGISTRY"),
        ("education@civiccore.demo", "Demo@2026", "EDUCATION_OFFICER", "Robert Kasule", "EDUCATION_AUTHORITY"),
        ("revenue@civiccore.demo", "Demo@2026", "REVENUE_OFFICER", "Sarah Nanteza", "REVENUE_SERVICE"),
        ("labour@civiccore.demo", "Demo@2026", "LABOUR_OFFICER", "David Mutebi", "LABOUR_AUTHORITY"),
        ("border@civiccore.demo", "Demo@2026", "BORDER_OFFICER", "Patrick Ogenga", "BORDER_CONTROL"),
        ("admin@civiccore.demo", "Demo@2026", "SYSTEM_ADMIN", "System Administrator", "ICT_AUTHORITY"),
    ]

    user_ids = {}
    for email, password, role, name, sector in accounts:
        pwd_hash = ph.hash(password)
        cur.execute(
            "INSERT INTO core.users (email, password_hash, role, full_name, sector) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id",
            (email, pwd_hash, role, name, sector)
        )
        user_ids[role] = cur.fetchone()[0]

    # 2. Create Citizens
    citizens = [
        ("M", 1985, 1, "James Ssali", "Kampala", "Kavali"),
        ("F", 1995, 42, "Grace Nakato", "Wakiso", "Kavali"),
        ("M", 1960, 3, "Solomon Okello", "Jinja", "Kavali"),
        ("M", 1990, 4, "Pierre Dubois", "N/A", "France"),
        ("M", 2020, 2, "Thomas Ssali", "Kampala", "Kavali"),
    ]

    citizen_ids = {}
    for sex, year, seq, name, district, nationality in citizens:
        cid = generate_citizen_id(sex, year, seq)
        is_foreign = nationality != "Kavali"
        status = "DECEASED" if name == "Solomon Okello" else "ACTIVE"
        
        cur.execute(
            "INSERT INTO core.citizens (citizen_id, full_name, sex, year_of_birth, district_of_birth, nationality, status, is_foreign_national) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (citizen_id) DO NOTHING RETURNING id",
            (cid, name, sex, year, district, nationality, status, is_foreign)
        )
        citizen_ids[name] = cid

    # Link family
    cur.execute("UPDATE core.citizens SET spouse_citizen_id = %s WHERE citizen_id = %s", (citizen_ids["Grace Nakato"], citizen_ids["James Ssali"]))
    cur.execute("UPDATE core.citizens SET spouse_citizen_id = %s WHERE citizen_id = %s", (citizen_ids["James Ssali"], citizen_ids["Grace Nakato"]))
    cur.execute("UPDATE core.citizens SET father_citizen_id = %s, mother_citizen_id = %s WHERE citizen_id = %s", 
                (citizen_ids["James Ssali"], citizen_ids["Grace Nakato"], citizen_ids["Thomas Ssali"]))
    cur.execute("INSERT INTO core.citizen_children (parent_citizen_id, child_citizen_id, relationship) VALUES (%s, %s, 'BIOLOGICAL'), (%s, %s, 'BIOLOGICAL') ON CONFLICT DO NOTHING",
                (citizen_ids["James Ssali"], citizen_ids["Thomas Ssali"], citizen_ids["Grace Nakato"], citizen_ids["Thomas Ssali"]))

    # 3. Add Sector Records
    # James Education
    james_cid = citizen_ids["James Ssali"]
    cur.execute("INSERT INTO education.records (citizen_id, institution_name, institution_type, enrollment_date, status, recorded_by) VALUES (%s, %s, %s, %s, %s, %s)",
                (james_cid, "Kavali National University", "TERTIARY", "2004-09-01", "COMPLETED", user_ids["EDUCATION_OFFICER"]))

    # James Revenue
    cur.execute("INSERT INTO revenue.records (citizen_id, tax_id, taxpayer_category, compliance_status, registered_by) VALUES (%s, %s, %s, %s, %s)",
                (james_cid, "KV-TAX-20090000042", "INDIVIDUAL", "COMPLIANT", user_ids["REVENUE_OFFICER"]))

    # James Labour
    cur.execute("INSERT INTO labour.records (citizen_id, employer_name, job_title, employment_type, start_date, nssf_number, nssf_status, recorded_by) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (james_cid, "Kavali National Bank", "Head of Digital", "FORMAL", "2015-01-01", "NSSF-1985-00421", "ACTIVE", user_ids["LABOUR_OFFICER"]))

    # Add James as a user (Citizen role)
    pwd_hash = ph.hash("Demo@2026")
    cur.execute(
        "INSERT INTO core.users (email, password_hash, role, full_name, citizen_id) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING",
        (james_cid, pwd_hash, "CITIZEN", "James Ssali", james_cid)
    )

    conn.commit()
    cur.close()
    conn.close()
    print("Database seeded successfully!")

if __name__ == "__main__":
    seed()
