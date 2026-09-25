# Telephony

**This product has no phone number.** It cannot receive a call, it cannot place one,
and nothing in this repository talks to a carrier. The helpline in the interface is a
simulator: it runs in the browser, on the same pipeline as the text interface, and it
says so on screen for as long as it is open.

This file describes the seam where an approved provider would connect, so that doing
it later is a matter of writing one class rather than redesigning the pipeline.

## What exists today

`backend/app/services/telephony.py` holds the `TelephonyProvider` protocol and one
implementation, `NullProvider`, which is the default and the only one.

`NullProvider` **refuses** rather than returning a session nobody can use. A provider
that silently did nothing would let an interface show a call timer for a call that is
not happening, and the person on the other end of that would be nobody.

```python
from app.services.telephony import build_provider

provider = build_provider()      # always NullProvider today
provider.available               # False
provider.start_session()         # raises TelephonyUnavailable
```

A provider name the builder does not recognise also falls back to `NullProvider`. A
typo in configuration must not look like a connected phone service.

## The interface a real provider implements

| Method | When it is called | What it must not do |
|---|---|---|
| `start_session(language=None)` | A call is answered | Invent a caller identity the carrier did not supply |
| `on_transcript(session, transcript)` | Words arrive from the caller | Act on a transcript whose `final` is false |
| `send_tts(session, text)` | An answer is ready to speak | Speak anything the pipeline did not produce |
| `end_session(session)` | The call ends, however it ends | Raise — cleanup has to work after a failure |

`Transcript.final` separates a settled utterance from a partial one. Answering a
partial transcript means answering a question the caller has not finished asking, and
over the phone they cannot see that it happened.

## What a provider must not change

The rule from Phase 8, pinned by `backend/tests/test_voice.py` (T10): **the channel a
question arrives on must not change the answer.** The same words must produce the
same abstention code, the same escalation level, the same sources and the same safety
flags whether typed, spoken or called in.

In the pipeline, `QueryRequest.channel` reaches the audit row and nothing else. It is
not read by retrieval, the confidence rule, the guardrails or the composer. Anyone
connecting a provider should keep it that way: a product whose refusals depended on
the microphone would be refusing for the wrong reason, and the person least able to
notice is the one who cannot read the screen well enough to type.

## Before connecting anything

These are decisions for whoever connects a service, not defaults to inherit:

- **Recording.** Nothing here records audio, and the browser voice input keeps none.
  A carrier that records by default is a separate consent question in every
  jurisdiction this product covers.
- **Retention.** The audit row holds a question *hash*, never the words. A telephony
  provider that logs transcripts on its own side is outside that guarantee.
- **The standing notice.** Whatever is said at the start of a real call has to carry
  what the interface carries: information, not legal advice, and where guidance ends.
- **Cost and abuse.** The rate limiter is per session. A phone line needs its own.

## Configuration

There is none yet, deliberately. When a provider is chosen, it reads from the
environment like every other secret in `backend/app/core/settings.py`, and
`build_provider` grows one branch. Until then the only honest configuration is the
absence of one.
