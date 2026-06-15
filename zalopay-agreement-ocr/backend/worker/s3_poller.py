"""
S3 poller — scans S3_BUCKET/uploads/ for new files not yet OCR-processed,
downloads and triggers OCR for each. Idempotent via agreement.s3_key lookup.
"""
import os
import asyncio
import logging
from functools import partial

logger = logging.getLogger(__name__)

S3_PREFIX = "uploads/"
POLL_INTERVAL_SEC = int(os.environ.get("POLL_INTERVAL_SEC", "60"))


async def poll_once(process_fn):
    from storage.s3 import get_s3_client, S3_BUCKET, s3_enabled
    if not s3_enabled():
        return

    s3 = get_s3_client()

    def _list():
        return s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=S3_PREFIX).get("Contents", [])

    objects = await asyncio.to_thread(_list)
    if not objects:
        return

    keys = [obj["Key"] for obj in objects]

    from models.database import AsyncSessionLocal
    from models.db import Agreement
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Agreement.s3_key).where(Agreement.s3_key.in_(keys)))
        processed = {row.s3_key for row in result}

    new_objects = [obj for obj in objects if obj["Key"] not in processed]
    for obj in new_objects:
        key = obj["Key"]
        # Strip uuid prefix: uploads/{uuid}_{filename} → filename
        fname = key[len(S3_PREFIX):]
        if "_" in fname:
            fname = fname[fname.index("_") + 1:]

        logger.info("S3 poller: new file %s", key)
        try:
            def _download(k=key):
                return s3.get_object(Bucket=S3_BUCKET, Key=k)["Body"].read()

            file_bytes = await asyncio.to_thread(_download)
            await process_fn(file_bytes, fname, key)
        except Exception as e:
            logger.error("S3 poller: failed to process %s — %s", key, e)


async def start_poller(process_fn):
    from storage.s3 import s3_enabled
    if not s3_enabled():
        logger.info("S3 poller disabled (S3_ENDPOINT_URL/S3_ACCESS_KEY not set)")
        return
    logger.info("S3 poller started — interval=%ss", POLL_INTERVAL_SEC)
    while True:
        try:
            await poll_once(process_fn)
        except Exception as e:
            logger.error("S3 poll error: %s", e)
        await asyncio.sleep(POLL_INTERVAL_SEC)
