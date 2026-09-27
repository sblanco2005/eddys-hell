#!/usr/bin/env python3
"""Upload a video to YouTube as unlisted. First run opens a browser for OAuth."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
ROOT = Path(__file__).resolve().parents[1]
CLIENT_SECRET = ROOT / "secrets" / "client_secret.json"
TOKEN_PATH = ROOT / "secrets" / "token.json"


def get_creds():
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CLIENT_SECRET.exists():
                print(f"Missing {CLIENT_SECRET}", file=sys.stderr)
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json())
        os.chmod(TOKEN_PATH, 0o600)
    return creds


def upload(path: Path, title: str, description: str = "", privacy: str = "unlisted") -> str:
    youtube = build("youtube", "v3", credentials=get_creds())
    body = {
        "snippet": {
            "title": title[:100],
            "description": description[:5000],
            "categoryId": "17",  # Sports
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(str(path), chunksize=8 * 1024 * 1024, resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"Upload {int(status.progress() * 100)}%", flush=True)
    vid = response["id"]
    print(json.dumps({"youtubeId": vid, "youtubeUrl": f"https://youtu.be/{vid}"}))
    return vid


def main():
    p = argparse.ArgumentParser()
    p.add_argument("file", nargs="?", help="Video file to upload")
    p.add_argument("--title", default="Eddy's Hell · Thursday")
    p.add_argument("--description", default="Unlisted Thursday workout for the group.")
    p.add_argument("--auth-only", action="store_true", help="Only complete OAuth; no upload")
    args = p.parse_args()
    if args.auth_only:
        get_creds()
        print("OK: YouTube OAuth token saved.")
        return
    if not args.file:
        p.error("file required unless --auth-only")
    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        print(f"Not found: {path}", file=sys.stderr)
        sys.exit(1)
    upload(path, args.title, args.description)


if __name__ == "__main__":
    main()
