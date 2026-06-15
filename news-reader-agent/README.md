# News Reader Agent

A simple news-reading agent that fetches headlines from Vietnamese RSS feeds and prints them to the console.

## Setup

1. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Run

```bash
python news_agent.py --source vnexpress --count 5
```

## Options

- `--source`: feed source name (`vnexpress`, `zing`, `tuoitre`, `vneconomy`, `all`)
- `--count`: number of headlines to show
- `--query`: filter headlines by keyword
- `--summary`: fetch a short summary of the selected article
- `--rss`: URL of a custom RSS feed
