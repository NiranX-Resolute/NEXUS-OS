"""Nexus OS v5.0 - JMAP & mxRaven Agent Inbox Integration.

Implements high-speed, stateless email ingestion and submission over JMAP
(RFC 8620 Core & RFC 8621 Mail) for sovereign agent communication
(e.g., agent@domain.com via mxRaven or custom JMAP server).

Capabilities:
1. JMAP Session Discovery: Resolves apiUrl, downloadUrl, and account capabilities.
2. Email/query & Email/get: Fetches unread agent instructions with thread references.
3. Email/set & EmailSubmission/set: Composes and submits outbound replies.
4. Auto-converts incoming emails into structured Nexus agent tasks.
"""

from __future__ import annotations

import email.utils
import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("nexus.edge.jmap")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [JMAP] %(message)s")

# JMAP Capabilities URIs (RFC 8620 & RFC 8621)
CAPABILITY_CORE = "urn:ietf:params:jmap:core"
CAPABILITY_MAIL = "urn:ietf:params:jmap:mail"
CAPABILITY_SUBMISSION = "urn:ietf:params:jmap:submission"


@dataclass
class JMAPConfig:
    """Connection credentials and configuration for JMAP server."""
    api_url: str = field(default_factory=lambda: os.getenv("JMAP_API_URL", "https://mail.mxraven.com/jmap/api"))
    session_url: str = field(default_factory=lambda: os.getenv("JMAP_SESSION_URL", "https://mail.mxraven.com/.well-known/jmap"))
    bearer_token: Optional[str] = field(default_factory=lambda: os.getenv("JMAP_BEARER_TOKEN"))
    agent_email: str = field(default_factory=lambda: os.getenv("JMAP_AGENT_EMAIL", "agent@nexus-os.internal"))
    account_id: Optional[str] = field(default_factory=lambda: os.getenv("JMAP_ACCOUNT_ID"))


@dataclass
class InboundAgentEmail:
    """Parsed representation of an inbound agent email."""
    email_id: str
    thread_id: str
    sender: str
    recipient: str
    subject: str
    preview: str
    body_text: str
    received_at: str
    has_command: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "email_id": self.email_id,
            "thread_id": self.thread_id,
            "sender": self.sender,
            "recipient": self.recipient,
            "subject": self.subject,
            "preview": self.preview,
            "body_text": self.body_text,
            "received_at": self.received_at,
            "has_command": self.has_command,
        }


class JMAPClient:
    """Client for JMAP (RFC 8620 / RFC 8621) Server."""

    def __init__(self, config: Optional[JMAPConfig] = None):
        self.config = config or JMAPConfig()
        self._session_data: Optional[Dict[str, Any]] = None
        self._account_id = self.config.account_id
        self._api_url = self.config.api_url

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "NexusJMAPClient/5.0",
        }
        if self.config.bearer_token:
            headers["Authorization"] = f"Bearer {self.config.bearer_token}"
        return headers

    def authenticate_session(self) -> Dict[str, Any]:
        """Discovers JMAP session endpoints and primary account ID."""
        try:
            req = urllib.request.Request(
                self.config.session_url,
                headers=self._get_headers(),
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._session_data = data
                self._api_url = data.get("apiUrl", self.config.api_url)

                # Resolve primary mail account ID
                primary_accounts = data.get("primaryAccounts", {})
                self._account_id = primary_accounts.get(CAPABILITY_MAIL)
                if not self._account_id:
                    accounts = data.get("accounts", {})
                    if accounts:
                        self._account_id = next(iter(accounts.keys()))

                logger.info(
                    "JMAP session initialized. Account: %s, API URL: %s",
                    self._account_id,
                    self._api_url,
                )
                return data
        except Exception as e:
            logger.warning("JMAP session discovery error: %s. Using configured defaults.", e)
            if not self._account_id:
                self._account_id = "default-nexus-account"
            return {"apiUrl": self._api_url, "accountId": self._account_id}

    def call_jmap(self, method_calls: List[List[Any]]) -> Dict[str, Any]:
        """Executes a batched JMAP POST request with method calls."""
        if not self._account_id:
            self.authenticate_session()

        payload = {
            "using": [CAPABILITY_CORE, CAPABILITY_MAIL, CAPABILITY_SUBMISSION],
            "methodCalls": method_calls,
        }

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                self._api_url,
                data=data,
                headers=self._get_headers(),
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                return res_json
        except Exception as e:
            logger.error("JMAP method call failure: %s", e)
            return {"methodResponses": [["error", {"type": "transportError", "description": str(e)}, "err"]]}

    def query_inbox(self, limit: int = 10, unread_only: bool = True) -> List[InboundAgentEmail]:
        """Queries recent emails delivered to the agent's inbox."""
        if not self._account_id:
            self.authenticate_session()

        filter_criteria: Dict[str, Any] = {}
        if unread_only:
            filter_criteria["notKeyword"] = "$seen"

        # Batched call: Email/query followed by back-referenced Email/get
        method_calls = [
            [
                "Email/query",
                {
                    "accountId": self._account_id,
                    "filter": filter_criteria,
                    "sort": [{"property": "receivedAt", "isAscending": False}],
                    "limit": limit,
                },
                "q0",
            ],
            [
                "Email/get",
                {
                    "accountId": self._account_id,
                    "#ids": {
                        "resultOf": "q0",
                        "name": "Email/query",
                        "path": "/ids",
                    },
                    "properties": [
                        "id",
                        "threadId",
                        "mailboxIds",
                        "from",
                        "to",
                        "subject",
                        "receivedAt",
                        "preview",
                        "bodyValues",
                        "textBody",
                    ],
                },
                "g0",
            ],
        ]

        response = self.call_jmap(method_calls)
        emails: List[InboundAgentEmail] = []

        for resp in response.get("methodResponses", []):
            name, payload, _ = resp
            if name == "Email/get":
                for item in payload.get("list", []):
                    from_list = item.get("from") or [{}]
                    sender_email = from_list[0].get("email", "unknown@sender")
                    to_list = item.get("to") or [{}]
                    recipient_email = to_list[0].get("email", self.config.agent_email)
                    subject = item.get("subject", "(No Subject)")
                    preview = item.get("preview", "")

                    # Extract body text from bodyValues
                    body_text = preview
                    body_values = item.get("bodyValues", {})
                    text_parts = item.get("textBody", [])
                    if text_parts and text_parts[0].get("partId") in body_values:
                        part_id = text_parts[0]["partId"]
                        body_text = body_values[part_id].get("value", preview)

                    # Determine if it's a command directed to agent
                    is_cmd = subject.startswith("!") or subject.startswith("/") or "task:" in subject.lower()

                    emails.append(
                        InboundAgentEmail(
                            email_id=item.get("id", ""),
                            thread_id=item.get("threadId", ""),
                            sender=sender_email,
                            recipient=recipient_email,
                            subject=subject,
                            preview=preview,
                            body_text=body_text,
                            received_at=item.get("receivedAt", time.strftime("%Y-%m-%dT%H:%M:%SZ")),
                            has_command=is_cmd,
                        )
                    )

        return emails

    def send_email(
        self,
        to_address: str,
        subject: str,
        body_text: str,
        in_reply_to: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Composes and submits an outbound email via Email/set and EmailSubmission/set."""
        if not self._account_id:
            self.authenticate_session()

        draft_id = f"draft_{int(time.time() * 1000)}"
        email_create_obj = {
            "mailboxIds": {"outbox": True},
            "from": [{"name": "Nexus Autonomous Agent", "email": self.config.agent_email}],
            "to": [{"email": to_address}],
            "subject": subject,
            "receivedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "bodyValues": {
                "body": {
                    "value": body_text,
                    "isTruncated": False,
                }
            },
            "textBody": [{"partId": "body", "type": "text/plain"}],
        }

        if in_reply_to:
            email_create_obj["inReplyTo"] = [in_reply_to]

        submission_id = f"sub_{int(time.time() * 1000)}"
        method_calls = [
            [
                "Email/set",
                {
                    "accountId": self._account_id,
                    "create": {draft_id: email_create_obj},
                },
                "set_email",
            ],
            [
                "EmailSubmission/set",
                {
                    "accountId": self._account_id,
                    "create": {
                        submission_id: {
                            "emailId": f"#{draft_id}",
                            "identityId": self._account_id,
                            "envelope": {
                                "mailFrom": {"email": self.config.agent_email},
                                "rcptTo": [{"email": to_address}],
                            },
                        }
                    },
                },
                "send_email",
            ],
        ]

        res = self.call_jmap(method_calls)
        logger.info("Outbound JMAP email sent to '%s': '%s'", to_address, subject)
        return res

    def mark_as_read(self, email_id: str) -> bool:
        """Sets the $seen keyword on an email to mark it as read."""
        if not self._account_id:
            self.authenticate_session()

        method_calls = [
            [
                "Email/set",
                {
                    "accountId": self._account_id,
                    "update": {
                        email_id: {
                            "keywords/$seen": True,
                        }
                    },
                },
                "mark_read",
            ]
        ]
        res = self.call_jmap(method_calls)
        return "methodResponses" in res


def get_agent_inbox_client() -> JMAPClient:
    """Helper factory that creates JMAPClient with vault credentials if available."""
    # Attempt to load token from DPAPI vault
    try:
        from core.security.vault import get_secret
        token = get_secret("JMAP_BEARER_TOKEN") or os.getenv("JMAP_BEARER_TOKEN")
        agent_email = get_secret("JMAP_AGENT_EMAIL") or os.getenv("JMAP_AGENT_EMAIL", "agent@nexus-os.internal")
        cfg = JMAPConfig(bearer_token=token, agent_email=agent_email)
        return JMAPClient(cfg)
    except Exception:
        return JMAPClient()


# Aliases for convenience
JmapClient = JMAPClient
InboundEmail = InboundAgentEmail
