"""Where a telephony provider would plug in, and the fact that none is.

This product has no phone number. It cannot receive a call, it cannot place
one, and nothing in this repository talks to a carrier. What is here is the
shape of the seam — so that connecting an approved SIP or telephony provider
later is a matter of writing one class, and so that nobody has to guess what
that class would need to do.

`NullProvider` is the default and the only implementation. It refuses to start
a session rather than returning a plausible-looking handle, because a provider
that silently does nothing is how an interface ends up showing a call timer for
a call that is not happening.

The helpline simulator in the browser is not this. It is a rehearsal of the
conversation, running entirely on the same pipeline as the text interface, and
it says so on screen for as long as it is open. It never touches this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class TelephonyUnavailable(RuntimeError):
    """Raised instead of returning a session nobody can use."""


@dataclass(frozen=True)
class CallSession:
    session_id: str
    #: The language the caller is being handled in, once known.
    language: str | None = None
    #: Set by a provider that can report it. Never invented.
    caller_region: str | None = None


@dataclass
class Transcript:
    """What the caller said, as the provider heard it.

    `final` separates a settled utterance from a partial one. Acting on a
    partial transcript means answering a question the caller has not finished
    asking, which is worse over the phone than anywhere else: they cannot see
    that it happened.
    """

    text: str
    final: bool = True
    confidence: float | None = None


class TelephonyProvider(Protocol):
    """What an approved provider would have to offer.

    Deliberately small. Anything beyond this — recording, routing, queueing —
    is a decision for whoever connects a real service, not something to be
    designed here against a provider nobody has chosen.
    """

    name: str

    @property
    def available(self) -> bool:
        """False unless a real service is configured and reachable."""
        ...

    def start_session(self, *, language: str | None = None) -> CallSession: ...

    def on_transcript(self, session: CallSession, transcript: Transcript) -> None: ...

    def send_tts(self, session: CallSession, text: str) -> None: ...

    def end_session(self, session: CallSession) -> None: ...


@dataclass
class NullProvider:
    """No phone service. Says so, and refuses rather than pretending.

    Kept as a real object rather than `None` so the calling code has one shape
    to work against, and so a deployment that has not configured telephony
    fails loudly at the point of use instead of halfway through a call.
    """

    name: str = "null"
    #: Everything it was asked to do, for tests and for the audit of a
    #: deployment that thought it had telephony configured.
    refused: list[str] = field(default_factory=list)

    @property
    def available(self) -> bool:
        return False

    def start_session(self, *, language: str | None = None) -> CallSession:
        del language
        self.refused.append("start_session")
        raise TelephonyUnavailable(
            "No telephony provider is configured. This build has no phone service; "
            "the helpline simulator runs in the browser and connects to no call."
        )

    def on_transcript(self, session: CallSession, transcript: Transcript) -> None:
        del session, transcript
        self.refused.append("on_transcript")
        raise TelephonyUnavailable("No telephony provider is configured.")

    def send_tts(self, session: CallSession, text: str) -> None:
        del session, text
        self.refused.append("send_tts")
        raise TelephonyUnavailable("No telephony provider is configured.")

    def end_session(self, session: CallSession) -> None:
        del session
        self.refused.append("end_session")


def build_provider(name: str | None = None) -> TelephonyProvider:
    """The configured provider, which today is always the null one.

    A name this does not recognise is not an error worth crashing a deployment
    for, but it must not be treated as working either: it falls back to the
    null provider, which refuses loudly the moment anything tries to use it.
    """
    del name
    return NullProvider()
