"""
Google Drive storage — service account (no OAuth needed).
DRIVE_FOLDER_ID: share this folder with the service account email as Editor.
Credentials: set DRIVE_SERVICE_ACCOUNT_JSON (full JSON string) or DRIVE_SERVICE_ACCOUNT_FILE (path to key.json).
"""
import os
import io
import json
import asyncio
import logging

logger = logging.getLogger(__name__)

DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1Rjo_iB-x90ex7fDqY6vj6YQjw7ileWVI")
_SA_JSON_ENV  = "DRIVE_SERVICE_ACCOUNT_JSON"
_SA_FILE_ENV  = "DRIVE_SERVICE_ACCOUNT_FILE"
SCOPES = ["https://www.googleapis.com/auth/drive"]


def drive_enabled() -> bool:
    return bool(DRIVE_FOLDER_ID and (os.environ.get(_SA_JSON_ENV) or os.environ.get(_SA_FILE_ENV)))


def _build_creds():
    from google.oauth2 import service_account
    sa_json = os.environ.get(_SA_JSON_ENV)
    sa_file = os.environ.get(_SA_FILE_ENV)
    if sa_json:
        info = json.loads(sa_json)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    if sa_file:
        return service_account.Credentials.from_service_account_file(sa_file, scopes=SCOPES)
    raise RuntimeError("Drive credentials not configured (DRIVE_SERVICE_ACCOUNT_JSON / DRIVE_SERVICE_ACCOUNT_FILE missing)")


def get_drive_service():
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=_build_creds(), cache_discovery=False)


async def drive_upload_file(file_bytes: bytes, filename: str, mime_type: str = "application/octet-stream") -> dict:
    """Upload file to DRIVE_FOLDER_ID. Returns {id, webViewLink, name}."""
    from googleapiclient.http import MediaIoBaseUpload

    def _upload():
        svc = get_drive_service()
        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=False)
        return svc.files().create(
            body={"name": filename, "parents": [DRIVE_FOLDER_ID]},
            media_body=media,
            fields="id, webViewLink, name",
            supportsAllDrives=True,
        ).execute()

    return await asyncio.to_thread(_upload)


async def drive_list_files() -> list[dict]:
    """List PDF/image files in DRIVE_FOLDER_ID. Returns [{id, name, mimeType, modifiedTime, size, webViewLink}]."""
    def _list():
        svc = get_drive_service()
        query = (
            f"'{DRIVE_FOLDER_ID}' in parents and trashed=false and "
            "(mimeType='application/pdf' or mimeType='image/jpeg' or mimeType='image/png')"
        )
        results, page_token = [], None
        while True:
            resp = svc.files().list(
                q=query,
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)",
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            results.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return results

    return await asyncio.to_thread(_list)


async def drive_download_file(file_id: str) -> bytes:
    """Download file content by Drive file ID."""
    from googleapiclient.http import MediaIoBaseDownload

    def _download():
        svc = get_drive_service()
        request = svc.files().get_media(fileId=file_id, supportsAllDrives=True)
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = dl.next_chunk()
        return buf.getvalue()

    return await asyncio.to_thread(_download)


def drive_web_link_from_id(file_id: str) -> str:
    return f"https://drive.google.com/file/d/{file_id}/view"
