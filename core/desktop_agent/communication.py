"""
Nexus Sovereign Communication & Messaging Manager
=============================================================================
Provides private, zero-cloud contact management and messaging automation:
1. Contact Store: Local sovereign address book in ~/.nexus-agent/contacts.json
2. WhatsApp Messaging: Native & web automation (whatsapp:// and web.whatsapp.com)
3. Smart Message Composer: Context-aware message drafting and templates
=============================================================================
"""

import os
import re
import json
import time
import urllib.parse
import webbrowser
import subprocess
import platform
from typing import Dict, Any, List, Optional


class NexusCommunicationManager:
    """Manages address book and messaging actions."""

    CONTACTS_FILE = os.path.join(os.path.expanduser("~"), ".nexus-agent", "contacts.json")

    @classmethod
    def _load_contacts(cls) -> List[Dict[str, Any]]:
        if os.path.exists(cls.CONTACTS_FILE):
            try:
                with open(cls.CONTACTS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    @classmethod
    def _save_contacts(cls, contacts: List[Dict[str, Any]]) -> None:
        os.makedirs(os.path.dirname(cls.CONTACTS_FILE), exist_ok=True)
        with open(cls.CONTACTS_FILE, "w", encoding="utf-8") as f:
            json.dump(contacts, f, indent=2, ensure_ascii=False)

    @classmethod
    def add_contact(
        cls,
        name: str,
        phone: str,
        email: Optional[str] = None,
        notes: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Adds or updates a contact in the local sovereign store."""
        clean_name = name.strip()
        clean_phone = re.sub(r"[^\d+]", "", phone.strip())
        if not clean_name or not clean_phone:
            return {"success": False, "error": "Name and phone number are required"}

        contacts = cls._load_contacts()
        # Check if already exists
        updated = False
        for c in contacts:
            if c.get("name", "").lower() == clean_name.lower():
                c["phone"] = clean_phone
                if email:
                    c["email"] = email.strip()
                if notes:
                    c["notes"] = notes.strip()
                if tags:
                    c["tags"] = tags
                c["updated_at"] = time.time()
                updated = True
                break

        if not updated:
            new_contact = {
                "name": clean_name,
                "phone": clean_phone,
                "email": email.strip() if email else "",
                "notes": notes.strip() if notes else "",
                "tags": tags or [],
                "created_at": time.time(),
                "updated_at": time.time()
            }
            contacts.append(new_contact)

        cls._save_contacts(contacts)
        return {
            "success": True,
            "action": "updated" if updated else "created",
            "contact": {"name": clean_name, "phone": clean_phone, "email": email or ""},
            "message": f"Contact '{clean_name}' saved successfully"
        }

    @classmethod
    def list_contacts(cls, query: Optional[str] = None) -> Dict[str, Any]:
        """Lists contacts with optional search filtering."""
        contacts = cls._load_contacts()
        if query:
            q = query.lower().strip()
            filtered = [
                c for c in contacts
                if q in c.get("name", "").lower() or q in c.get("phone", "") or q in c.get("email", "").lower() or any(q in t.lower() for t in c.get("tags", []))
            ]
            return {"success": True, "count": len(filtered), "contacts": filtered}
        return {"success": True, "count": len(contacts), "contacts": contacts}

    @classmethod
    def get_contact(cls, name_or_phone: str) -> Optional[Dict[str, Any]]:
        """Finds a single contact by name or phone."""
        contacts = cls._load_contacts()
        target = name_or_phone.lower().strip()
        for c in contacts:
            if c.get("name", "").lower() == target or c.get("phone", "") == target:
                return c
        # Substring search
        for c in contacts:
            if target in c.get("name", "").lower():
                return c
        return None

    @classmethod
    def delete_contact(cls, name_or_phone: str) -> Dict[str, Any]:
        """Removes a contact."""
        contacts = cls._load_contacts()
        target = name_or_phone.lower().strip()
        initial_len = len(contacts)
        contacts = [c for c in contacts if c.get("name", "").lower() != target and c.get("phone", "") != target]

        if len(contacts) < initial_len:
            cls._save_contacts(contacts)
            return {"success": True, "message": f"Contact '{name_or_phone}' deleted"}
        return {"success": False, "error": f"Contact '{name_or_phone}' not found"}

    @classmethod
    def send_whatsapp(
        cls,
        recipient: str,
        message: str,
        auto_open: bool = True,
        use_app_protocol: bool = True
    ) -> Dict[str, Any]:
        """
        Sends or prepares a WhatsApp message to a phone number or saved contact.
        Supports native Windows WhatsApp protocol and web.whatsapp.com fallback.
        """
        # Resolve recipient
        contact = cls.get_contact(recipient)
        phone = contact["phone"] if contact else re.sub(r"[^\d+]", "", recipient.strip())

        # Ensure international format (strip leading + if in URL parameter for wa.me)
        clean_num = phone.lstrip("+")
        encoded_msg = urllib.parse.quote(message)

        # Build official URLs
        web_url = f"https://web.whatsapp.com/send?phone={clean_num}&text={encoded_msg}"
        app_url = f"whatsapp://send?phone={clean_num}&text={encoded_msg}"

        if auto_open:
            if use_app_protocol and platform.system() == "Windows":
                try:
                    subprocess.Popen(f'start "" "{app_url}"', shell=True)
                except Exception:
                    webbrowser.open(web_url)
            else:
                webbrowser.open(web_url)

        return {
            "success": True,
            "recipient": contact["name"] if contact else recipient,
            "phone": phone,
            "message": message,
            "web_url": web_url,
            "app_url": app_url,
            "status": "LAUNCHED" if auto_open else "PREPARED",
            "info": f"WhatsApp conversation opened for {recipient}"
        }

    @classmethod
    def draft_smart_reply(cls, context_topic: str, tone: str = "professional") -> Dict[str, Any]:
        """Creates a contextual smart reply or message template."""
        templates = {
            "confirmation": f"Hi! Just confirming our discussion regarding {context_topic}. Everything looks good to proceed on my end.",
            "status_update": f"Quick update on {context_topic}: The autonomous tasks and milestones are currently underway as planned. I will keep you posted.",
            "meeting": f"Hi, I'd like to schedule a quick sync about {context_topic}. Please let me know what times work best for you today or tomorrow.",
            "thank_you": f"Thank you for sharing the updates on {context_topic}! Appreciate your swift coordination."
        }
        draft = templates.get(tone.lower(), f"Hello! Following up on {context_topic}. Please let me know if you need any additional details.")
        return {
            "success": True,
            "topic": context_topic,
            "tone": tone,
            "draft": draft
        }
