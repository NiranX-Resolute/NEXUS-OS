"""
Nexus Autonomous Internet & Productivity Suite
=============================================================================
Provides zero-subscription internet research and desktop productivity tools:
1. Live News Feeds: Real-time category headlines and topic search via free RSS feeds
2. Web Information Retrieval: Fast Wikipedia & DuckDuckGo query synthesizers
3. Sovereign Notes: Markdown note management in ~/.nexus-agent/notes/
4. Todo / Task Planner: Priority task tracker in ~/.nexus-agent/todos.json
5. Timers & Reminders: Desktop notification and edge-tts audio alerts
=============================================================================
"""

import os
import re
import json
import time
import uuid
import threading
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional


class NexusProductivityManager:
    """Productivity and internet knowledge retrieval tools."""

    NOTES_DIR = os.path.join(os.path.expanduser("~"), ".nexus-agent", "notes")
    TODOS_FILE = os.path.join(os.path.expanduser("~"), ".nexus-agent", "todos.json")
    REMINDERS_FILE = os.path.join(os.path.expanduser("~"), ".nexus-agent", "reminders.json")

    # =========================================================================
    # 1. LIVE NEWS & HEADLINES (100% Free RSS, Zero API Key)
    # =========================================================================
    @classmethod
    def get_news(cls, category: str = "technology", limit: int = 10) -> Dict[str, Any]:
        """Fetches latest real-time headlines via free open RSS feeds."""
        category_feeds = {
            "technology": "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
            "world": "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
            "business": "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
            "science": "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en",
            "general": "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"
        }
        feed_url = category_feeds.get(category.lower(), category_feeds["technology"])
        return cls._fetch_rss(feed_url, limit)

    @classmethod
    def search_news(cls, query: str, limit: int = 10) -> Dict[str, Any]:
        """Searches real-time news articles on any topic."""
        encoded = urllib.parse.quote(query)
        feed_url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
        return cls._fetch_rss(feed_url, limit)

    @staticmethod
    def _fetch_rss(url: str, limit: int = 10) -> Dict[str, Any]:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus/4.2"}
            )
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                xml_data = resp.read()

            root = ET.fromstring(xml_data)
            items = []
            for item in root.findall(".//item")[:limit]:
                title = item.findtext("title", "")
                link = item.findtext("link", "")
                pub_date = item.findtext("pubDate", "")
                source = item.findtext("source", "")
                # Clean title
                clean_title = re.sub(r"\s+-\s+[^-]+$", "", title).strip() if " - " in title else title
                items.append({
                    "title": clean_title,
                    "source": source or "News Source",
                    "published": pub_date,
                    "link": link
                })

            return {
                "success": True,
                "count": len(items),
                "articles": items
            }
        except Exception as e:
            return {"success": False, "error": str(e), "articles": []}

    # =========================================================================
    # 2. WEB LOOKUP & KNOWLEDGE RETRIEVAL
    # =========================================================================
    @classmethod
    def quick_search(cls, query: str) -> Dict[str, Any]:
        """Searches Wikipedia & instant answers with zero API subscriptions."""
        encoded = urllib.parse.quote(query)
        # 1. Try Wikipedia summary API
        try:
            wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
            req = urllib.request.Request(wiki_url, headers={"User-Agent": "NexusDesktop/4.2"})
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "extract" in data:
                    return {
                        "success": True,
                        "query": query,
                        "title": data.get("title", query),
                        "summary": data.get("extract", ""),
                        "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
                        "source": "Wikipedia"
                    }
        except Exception:
            pass

        # 2. Fallback to DuckDuckGo Instant Answer API
        try:
            ddg_url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1"
            req = urllib.request.Request(ddg_url, headers={"User-Agent": "NexusDesktop/4.2"})
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                ddg_data = json.loads(resp.read().decode("utf-8"))
                abstract = ddg_data.get("AbstractText", "")
                if abstract:
                    return {
                        "success": True,
                        "query": query,
                        "title": ddg_data.get("Heading", query),
                        "summary": abstract,
                        "url": ddg_data.get("AbstractURL", ""),
                        "source": "DuckDuckGo"
                    }
        except Exception:
            pass

        return {
            "success": True,
            "query": query,
            "summary": f"Search completed for '{query}'. Direct web browser navigation recommended.",
            "url": f"https://duckduckgo.com/?q={encoded}",
            "source": "SearchPortal"
        }

    # =========================================================================
    # 3. SOVEREIGN QUICK NOTES
    # =========================================================================
    @classmethod
    def create_note(cls, title: str, content: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """Creates or appends to a markdown note stored locally."""
        try:
            os.makedirs(cls.NOTES_DIR, exist_ok=True)
            slug = re.sub(r"[^\w\-]", "_", title.lower()).strip("_")
            note_file = os.path.join(cls.NOTES_DIR, f"{slug}.md")

            tag_header = f"Tags: {', '.join(tags)}\n\n" if tags else ""
            date_str = time.strftime("%Y-%m-%d %H:%M:%S")
            full_text = f"# {title}\n*Created: {date_str}*\n{tag_header}\n{content.strip()}\n"

            with open(note_file, "w", encoding="utf-8") as f:
                f.write(full_text)

            return {
                "success": True,
                "title": title,
                "file_path": note_file,
                "size_bytes": os.path.getsize(note_file),
                "message": f"Note '{title}' saved successfully"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def list_notes(cls) -> Dict[str, Any]:
        """Lists all stored markdown notes."""
        try:
            if not os.path.exists(cls.NOTES_DIR):
                return {"success": True, "count": 0, "notes": []}

            notes = []
            for fname in os.listdir(cls.NOTES_DIR):
                if fname.endswith(".md"):
                    fpath = os.path.join(cls.NOTES_DIR, fname)
                    stat = os.stat(fpath)
                    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                        preview = "".join(f.readlines()[:5])
                    notes.append({
                        "name": fname.replace(".md", ""),
                        "path": fpath,
                        "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                        "preview": preview
                    })
            return {"success": True, "count": len(notes), "notes": notes}
        except Exception as e:
            return {"success": False, "error": str(e), "notes": []}

    @classmethod
    def get_note(cls, title: str) -> Dict[str, Any]:
        """Reads note contents."""
        slug = re.sub(r"[^\w\-]", "_", title.lower()).strip("_")
        note_file = os.path.join(cls.NOTES_DIR, f"{slug}.md")
        if not os.path.exists(note_file):
            return {"success": False, "error": f"Note '{title}' not found"}

        try:
            with open(note_file, "r", encoding="utf-8") as f:
                content = f.read()
            return {"success": True, "title": title, "content": content, "path": note_file}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def delete_note(cls, title: str) -> Dict[str, Any]:
        """Deletes note."""
        slug = re.sub(r"[^\w\-]", "_", title.lower()).strip("_")
        note_file = os.path.join(cls.NOTES_DIR, f"{slug}.md")
        if os.path.exists(note_file):
            try:
                os.remove(note_file)
                return {"success": True, "message": f"Note '{title}' deleted"}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": False, "error": f"Note '{title}' not found"}

    # =========================================================================
    # 4. TODO / TASK PLANNER
    # =========================================================================
    @classmethod
    def _load_todos(cls) -> List[Dict[str, Any]]:
        if os.path.exists(cls.TODOS_FILE):
            try:
                with open(cls.TODOS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    @classmethod
    def _save_todos(cls, todos: List[Dict[str, Any]]) -> None:
        os.makedirs(os.path.dirname(cls.TODOS_FILE), exist_ok=True)
        with open(cls.TODOS_FILE, "w", encoding="utf-8") as f:
            json.dump(todos, f, indent=2)

    @classmethod
    def add_todo(cls, task: str, priority: str = "normal", due_date: Optional[str] = None) -> Dict[str, Any]:
        """Adds a todo item to local list."""
        todos = cls._load_todos()
        todo_item = {
            "id": f"todo_{uuid.uuid4().hex[:6]}",
            "task": task.strip(),
            "priority": priority.lower(),
            "due_date": due_date,
            "completed": False,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        todos.append(todo_item)
        cls._save_todos(todos)
        return {"success": True, "todo": todo_item, "message": f"Added todo: '{task}'"}

    @classmethod
    def list_todos(cls, status: str = "all") -> Dict[str, Any]:
        """Lists todos with status filter: 'all', 'pending', 'completed'."""
        todos = cls._load_todos()
        if status.lower() == "pending":
            filtered = [t for t in todos if not t.get("completed")]
        elif status.lower() == "completed":
            filtered = [t for t in todos if t.get("completed")]
        else:
            filtered = todos
        return {"success": True, "count": len(filtered), "todos": filtered}

    @classmethod
    def toggle_todo(cls, todo_id: str) -> Dict[str, Any]:
        """Toggles todo completed status."""
        todos = cls._load_todos()
        for t in todos:
            if t.get("id") == todo_id or t.get("task").lower() == todo_id.lower():
                t["completed"] = not t.get("completed", False)
                cls._save_todos(todos)
                state = "Completed" if t["completed"] else "Pending"
                return {"success": True, "todo": t, "message": f"Task marked as {state}"}
        return {"success": False, "error": f"Todo '{todo_id}' not found"}

    @classmethod
    def delete_todo(cls, todo_id: str) -> Dict[str, Any]:
        """Removes todo."""
        todos = cls._load_todos()
        initial = len(todos)
        todos = [t for t in todos if t.get("id") != todo_id and t.get("task").lower() != todo_id.lower()]
        if len(todos) < initial:
            cls._save_todos(todos)
            return {"success": True, "message": f"Todo '{todo_id}' removed"}
        return {"success": False, "error": f"Todo '{todo_id}' not found"}

    # =========================================================================
    # 5. REMINDERS & TIMERS
    # =========================================================================
    @classmethod
    def set_reminder(cls, message: str, in_minutes: float = 1.0, speak: bool = True) -> Dict[str, Any]:
        """Schedules a desktop reminder with voice / toast notification."""
        rem_id = f"rem_{uuid.uuid4().hex[:6]}"
        due_time = time.time() + (in_minutes * 60)

        def _trigger_reminder():
            time.sleep(in_minutes * 60)
            print(f"\n🔔 [NEXUS REMINDER] {message}\n", flush=True)
            if speak:
                try:
                    import subprocess
                    clean = message.replace('"', '`"').replace("'", "’")
                    ps_alert = (
                        "Add-Type -AssemblyName System.Speech; "
                        f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                        f"$s.Speak('Reminder: {clean}');"
                    )
                    subprocess.run(["powershell", "-NoProfile", "-Command", ps_alert], capture_output=True)
                except Exception:
                    pass

        t = threading.Thread(target=_trigger_reminder, daemon=True)
        t.start()

        return {
            "success": True,
            "reminder_id": rem_id,
            "message": message,
            "in_minutes": in_minutes,
            "due_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(due_time)),
            "notification": f"Reminder set for {in_minutes} minutes from now"
        }
