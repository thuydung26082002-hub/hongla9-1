import os
import boto3
from botocore.config import Config


def s3_enabled() -> bool:
    return bool(os.environ.get("S3_ENDPOINT_URL") and os.environ.get("S3_ACCESS_KEY"))


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL", ""),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY", ""),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY", ""),
        region_name=os.environ.get("S3_REGION", "hcm01"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "zalopay-agreements")
S3_PREFIX = "uploads/"
