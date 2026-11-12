"""Slice D's real ports (called by ports.install_providers at app start) and the in-process simulated booking.

Nothing here talks to a third party: connectors, booking and payments are simulated (P10).
"""

from __future__ import annotations

import hashlib
import logging

from cg_api.laya import LayaClient
from cg_api.muse import MuseClient
from cg_api.muse.copy import MuseCopy
from cg_api.muse.extract import Extractor
from cg_api.settings import get_settings

log = logging.getLogger("cg_api.providers")


def simulated_book(venue: dict, start: str, party: int, *, fail: bool = False) -> str | None:
    """Confirmation code like "CH-4821", or None when full (or demo failNextBooking)."""
    # ponytail: capacity per slot only; opening hours and slots already taken land with M2 inventory
    if fail or (venue.get("booking") or {}).get("capacityPerSlot", party) < party:
        return None
    letters = "".join(w[0] for w in venue["name"].split()[:2]).upper()
    digits = int(hashlib.sha256(f"{venue['venueId']}|{start}|{party}".encode()).hexdigest()[:6], 16) % 9000 + 1000
    return f"{letters}-{digits}"


def install(ports) -> None:
    s = get_settings()
    p = s.params
    ports.laya = LayaClient(
        s.contracts_dir, fake=s.laya_fake, url=s.laya_url, model=s.laya_model, threshold=p["laya"]["decisiveThreshold"]
    )
    ports.muse = MuseClient(
        fake=s.muse_fake,
        base_url=s.muse_base_url,
        api_key=s.model_api_key,
        model=s.muse_model,
        timeout_s=p["muse"]["liveTimeoutS"],
    )
    ports.copy = MuseCopy(ports.muse)
    ports.extractor = Extractor(
        ports.muse,
        ports.laya,
        s.contracts_dir,
        visits_30d=p["nudges"]["frequentPlaceVisits30d"],
        threshold=p["laya"]["decisiveThreshold"],
        batch_timeout_s=p["muse"]["batchTimeoutS"],
    )
    # ponytail: ports.agent stays the stub until slice C's meetup store exists; ScriptedRun is ready for it
    log.info(
        "providers: muse %s, laya %s", "fake" if s.muse_fake else s.muse_base_url, "fake" if s.laya_fake else s.laya_url
    )
