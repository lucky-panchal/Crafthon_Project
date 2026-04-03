import os
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(override=True)

from app.services.auth_service import (
    get_user, create_user, verify_password,
    create_token, upsert_oauth_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

def _cfg():
    """Read env vars fresh every call — avoids import-time race with load_dotenv."""
    return {
        "GOOGLE_CLIENT_ID":     os.getenv("GOOGLE_CLIENT_ID", ""),
        "GOOGLE_CLIENT_SECRET": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "GOOGLE_REDIRECT_URI":  os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"),
        "GITHUB_CLIENT_ID":     os.getenv("GITHUB_CLIENT_ID", ""),
        "GITHUB_CLIENT_SECRET": os.getenv("GITHUB_CLIENT_SECRET", ""),
        "GITHUB_REDIRECT_URI":  os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/api/auth/github/callback"),
        "FRONTEND_URL":         os.getenv("FRONTEND_URL", "http://localhost:5173"),
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name:     str
    email:    str
    password: str

class LoginRequest(BaseModel):
    email:    str
    password: str


# ── JWT Auth ──────────────────────────────────────────────────────────────────

@router.post("/signup")
async def signup(body: SignupRequest):
    if await get_user(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user  = await create_user(body.name, body.email, body.password)
    token = create_token({"sub": user["id"], "email": user["email"], "name": user["name"]})
    return {"access_token": token, "token_type": "bearer", "user": {"name": user["name"], "email": user["email"]}}


@router.post("/login")
async def login(body: LoginRequest):
    user = await get_user(body.email)
    if not user or not user.get("password") or not verify_password(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token({"sub": user["id"], "email": user["email"], "name": user["name"]})
    return {"access_token": token, "token_type": "bearer", "user": {"name": user["name"], "email": user["email"]}}


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google")
def google_login():
    c = _cfg()
    if not c["GOOGLE_CLIENT_ID"]:
        raise HTTPException(status_code=501, detail="GOOGLE_CLIENT_ID not set in .env")
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={c['GOOGLE_CLIENT_ID']}"
        f"&redirect_uri={c['GOOGLE_REDIRECT_URI']}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        "&prompt=select_account"
    )
    return RedirectResponse(url, status_code=302)


@router.get("/google/callback")
async def google_callback(code: str):
    c = _cfg()
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     c["GOOGLE_CLIENT_ID"],
                "client_secret": c["GOOGLE_CLIENT_SECRET"],
                "redirect_uri":  c["GOOGLE_REDIRECT_URI"],
                "grant_type":    "authorization_code",
            },
        )
        token_data = token_res.json()
        if "error" in token_data:
            raise HTTPException(status_code=400, detail=f"Google error: {token_data['error_description']}")

        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        info = user_res.json()

    user  = await upsert_oauth_user(info.get("name", info.get("email", "")), info["email"], "google")
    token = create_token({"sub": user["id"], "email": user["email"], "name": user["name"]})
    redirect = f"{c['FRONTEND_URL']}?token={token}&name={user['name']}&email={user['email']}"
    return RedirectResponse(redirect, status_code=302)


# ── GitHub OAuth ──────────────────────────────────────────────────────────────

@router.get("/github")
def github_login():
    c = _cfg()
    if not c["GITHUB_CLIENT_ID"]:
        raise HTTPException(status_code=501, detail="GITHUB_CLIENT_ID not set in .env")
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={c['GITHUB_CLIENT_ID']}"
        f"&redirect_uri={c['GITHUB_REDIRECT_URI']}"
        "&scope=user:email"
    )
    return RedirectResponse(url, status_code=302)


@router.get("/github/callback")
async def github_callback(code: str):
    c = _cfg()
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id":     c["GITHUB_CLIENT_ID"],
                "client_secret": c["GITHUB_CLIENT_SECRET"],
                "code":          code,
                "redirect_uri":  c["GITHUB_REDIRECT_URI"],
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail=f"GitHub OAuth failed: {token_data}")

        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        info = user_res.json()

        email = info.get("email")
        if not email:
            email_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            emails = email_res.json()
            primary = next((e for e in emails if e.get("primary")), None)
            email = primary["email"] if primary else f"{info['login']}@github.com"

    user  = await upsert_oauth_user(info.get("name") or info["login"], email, "github")
    token = create_token({"sub": user["id"], "email": user["email"], "name": user["name"]})
    redirect = f"{c['FRONTEND_URL']}?token={token}&name={user['name']}&email={user['email']}"
    return RedirectResponse(redirect, status_code=302)
