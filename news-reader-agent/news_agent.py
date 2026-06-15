import argparse
import datetime

import feedparser
import requests
from bs4 import BeautifulSoup

NEWS_SOURCES = {
    "vnexpress": "https://vnexpress.net/rss/tin-noi-bat.rss",
    "zing": "https://zingnews.vn/rss/tin-moi-nhat.rss",
    "tuoitre": "https://tuoitre.vn/rss/tin-moi-nhat.rss",
    "vneconomy": "https://vneconomy.vn/rss/home.rss",
}


def parse_args():
    parser = argparse.ArgumentParser(description="News Reader Agent")
    parser.add_argument("--source", default="vnexpress", help="Feed source name or 'all' to show all sources")
    parser.add_argument("--count", type=int, default=10, help="Number of headlines to show")
    parser.add_argument("--query", default=None, help="Filter titles by keyword")
    parser.add_argument("--summary", action="store_true", help="Fetch a short summary for the first selected article")
    parser.add_argument("--rss", default=None, help="Custom RSS feed URL")
    return parser.parse_args()


def fetch_feed(url):
    feed = feedparser.parse(url)
    if feed.bozo:
        raise ValueError(f"Không thể phân tích RSS: {url}")
    return feed.entries


def summarize_article(url, max_sentences=3):
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        paragraphs = [p.get_text(strip=True) for p in soup.find_all("p") if p.get_text(strip=True)]
        if not paragraphs:
            return "Không tìm thấy nội dung tóm tắt."

        text = " ".join(paragraphs)
        sentences = text.replace("?", ".").replace("!", ".").split(".")
        summary = ". ".join([s.strip() for s in sentences if s.strip()][:max_sentences])
        return summary + "." if summary else "Không tìm thấy nội dung tóm tắt."
    except Exception as exc:
        return f"Tóm tắt không khả dụng: {exc}"


def print_entries(entries, count, query=None):
    filtered = entries
    if query:
        query_lower = query.lower()
        filtered = [entry for entry in entries if query_lower in entry.title.lower() or query_lower in getattr(entry, "summary", "").lower()]

    for idx, entry in enumerate(filtered[:count], start=1):
        published = getattr(entry, "published", "Không rõ thời gian")
        print(f"{idx}. {entry.title}")
        print(f"   Link: {entry.link}")
        print(f"   Published: {published}")
        if hasattr(entry, "summary") and entry.summary:
            summary = BeautifulSoup(entry.summary, "html.parser").get_text(strip=True)
            print(f"   Summary: {summary[:240]}{'...' if len(summary) > 240 else ''}")
        print()


def main():
    args = parse_args()
    source_list = []
    if args.rss:
        source_list = [("custom", args.rss)]
    elif args.source == "all":
        source_list = list(NEWS_SOURCES.items())
    else:
        key = args.source.lower()
        if key not in NEWS_SOURCES:
            raise SystemExit(f"Nguồn không hợp lệ: {key}. Chọn một trong: {', '.join(NEWS_SOURCES)}")
        source_list = [(key, NEWS_SOURCES[key])]

    all_entries = []
    for name, url in source_list:
        try:
            entries = fetch_feed(url)
            all_entries.extend(entries)
            print(f"=== {name.upper()} ({len(entries)} mục) ===")
            print_entries(entries, args.count, args.query)
        except Exception as exc:
            print(f"Lỗi khi lấy nguồn {name}: {exc}\n")

    if args.summary and all_entries:
        first_link = all_entries[0].link
        print("=== Tóm tắt bài viết đầu tiên ===")
        print(summarize_article(first_link))


if __name__ == "__main__":
    main()
