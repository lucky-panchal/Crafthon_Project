import os
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
try:
    import motor.motor_asyncio as motor_asyncio
except ModuleNotFoundError:
    motor_asyncio = None

load_dotenv(override=True)

SECRET_KEY = os.getenv("JWT_SECRET", "raksha-secret")
ALGORITHM  = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MINUTES", "10080"))
MONGO_URI  = os.getenv("MONGODB_URI", "")
MONGO_DB   = os.getenv("MONGODB_DB", "raksha")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── MongoDB client ────────────────────────────────────────────────────────────
_client: Optional[Any] = None
_db     = None
_col    = None

def _ensure_auth_store():
    if motor_asyncio is None:
        raise RuntimeError("Auth backend requires the 'motor' package. Install backend requirements first.")
    if not MONGO_URI:
        raise RuntimeError("Auth backend requires MONGODB_URI to be set.")

def get_db():
    global _client, _db, _col
    _ensure_auth_store()
    if _client is None:
        _client = motor_asyncio.AsyncIOMotorClient(MONGO_URI)
        _db     = _client[MONGO_DB]
        _col    = _db["users"]
    return _col


# ── Password utils ────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT utils ─────────────────────────────────────────────────────────────────

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=EXPIRE_MIN)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── User CRUD (async) ─────────────────────────────────────────────────────────

async def get_user(email: str) -> Optional[dict]:
    col = get_db()
    return await col.find_one({"email": email}, {"_id": 0})

async def get_user_by_id(user_id: str) -> Optional[dict]:
    col = get_db()
    return await col.find_one({"id": user_id}, {"_id": 0})

async def create_user(name: str, email: str, password: str = None, provider: str = "local") -> dict:
    col  = get_db()
    user = {
        "id":       str(uuid.uuid4()),
        "name":     name,
        "email":    email,
        "password": hash_password(password) if password else None,
        "provider": provider,
        "created":  datetime.utcnow().isoformat(),
    }
    await col.insert_one({**user})
    return user

async def upsert_oauth_user(name: str, email: str, provider: str) -> dict:
    existing = await get_user(email)
    if existing:
        return existing
    return await create_user(name, email, provider=provider)
