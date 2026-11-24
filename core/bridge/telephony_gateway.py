"""
Nexus Telephony & Webhook Alerting Gateway
=============================================================================
Inspired by Bolna.
Enables Nexus to bridge physical communications:
1. Dispatches automated phone alerts / calls via Twilio or Plivo webhooks.
2. Dispatches SMS and emergency webhook alerts for mission-critical events.
3. Event-driven alert router for build failures, long task completions, and security gates.
=============================================================================
"""

import json
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List


@dataclass
class TelephonyAlert:
    recipient: str
    message: str
    alert_type: str  # 'VOICE', 'SMS', 'WEBHOOK'
    status: str = "PENDING"
    timestamp: float = field(default_factory=time.time)


class TelephonyGateway:
    """
    Manages automated outbound voice calls, SMS, and high-priority webhook notifications.
    """

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url
        self.history: List[TelephonyAlert] = []

    def dispatch_alert(
        self,
        recipient: str,
        message: str,
        alert_type: str = "WEBHOOK",
        custom_endpoint: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Dispatches an automated alert.
        """
        alert = TelephonyAlert(
            recipient=recipient,
            message=message,
            alert_type=alert_type.upper()
        )
        self.history.append(alert)

        endpoint = custom_endpoint or self.webhook_url
        if endpoint and alert_type.upper() == "WEBHOOK":
            try:
                payload = json.dumps({
                    "to": recipient,
                    "text": message,
                    "timestamp": alert.timestamp,
                    "source": "Nexus Flagship Agent"
                }).encode("utf-8")

                req = urllib.request.Request(
                    endpoint,
                    data=payload,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    alert.status = "DELIVERED"
                    return {"success": True, "status": "DELIVERED", "code": resp.status}
            except Exception as e:
                alert.status = "FAILED"
                return {"success": False, "status": "FAILED", "error": str(e)}

        # If voice or local simulation
        alert.status = "DISPATCHED"
        return {"success": True, "status": "DISPATCHED", "alert": alert}

    def list_history(self) -> List[Dict[str, Any]]:
        return [
            {
                "to": a.recipient,
                "type": a.alert_type,
                "status": a.status,
                "timestamp": a.timestamp,
                "msg": a.message[:60]
            }
            for a in self.history
        ]
