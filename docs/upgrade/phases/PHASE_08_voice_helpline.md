# Phase 8 - Voice Sahayak, Helpline Simulator, telephony adapter

Goal: voice access for people who prefer speaking, on the same pipeline and safety rules, with no pretend phone service.
Read: PROGRESS.md (speech capability map from Phase 6), this file.

## Build
1. Voice Sahayak inside Ask Sahayak (dynamic import, flag voice): tap the microphone -> capture -> transcript shown and editable -> the user submits (never auto-submit) -> run_pipeline(channel="voice") -> normal cited answer -> optional text-to-speech playback. Check browser support per language at runtime; if unsupported, say so plainly and offer typing. No audio is stored after the session. Clinical questions get the same abstention as text.
2. Helpline Simulator (flag helplineSim, browser only): call-style screen with timer, live transcript, detected language, retrieval status from real PipelineEvents, key citations, an escalation button and "End call". Persistent label: "Simulated call in your browser. No phone service is connected." End-of-call summary: call summary, questions asked, guidance given, sources, unresolved issues, next actions (printable, saveable to a case when logged in).
3. Telephony adapter: backend interface TelephonyProvider (start_session, on_transcript or on_audio_chunk, send_tts, end_session) with a NullProvider default, configuration from env, and docs/upgrade/TELEPHONY.md explaining how an approved SIP/telephony provider plugs in later. No keys, no live claims, nothing required for the SIH demo.

## Tests to add
T10: the same transcript through the voice channel and the text channel produces identical abstention codes, escalation level, sources and safety flags (parametrised over eval classes). No audio persistence. Simulator summary schema. The simulator label is always rendered.

## Gate
Full gate green; bundle check shows voice code is not in first load. Commit "phase 8: voice". Report in 15 lines or fewer.
