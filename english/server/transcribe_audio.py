#!/usr/bin/env python3

import argparse
import json
import os
import tempfile
import urllib.request
from pathlib import Path

from faster_whisper import WhisperModel


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe remote audio with faster-whisper.")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--audio-url")
    source_group.add_argument("--audio-path")
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--best-of", type=int, default=1)
    parser.add_argument("--word-timestamps", action="store_true")
    return parser.parse_args()


def download_audio(audio_url):
    request = urllib.request.Request(
        audio_url,
        headers={
            "User-Agent": "LinguaLearn Sync Reader/1.0",
        },
    )

    with urllib.request.urlopen(request) as response:
        suffix = Path(audio_url).suffix or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)
            return tmp.name


def normalize_words(segment):
    normalized_words = []
    for word in getattr(segment, "words", []) or []:
        text = str(getattr(word, "word", "")).strip()
        start = getattr(word, "start", None)
        end = getattr(word, "end", None)

        if not text or start is None or end is None:
            continue

        normalized_words.append(
            {
                "text": text,
                "start": round(float(start), 3),
                "end": round(float(end), 3),
            }
        )

    return normalized_words


def normalize_segments(segments, include_words):
    normalized_segments = []
    transcript_lines = []

    for segment in segments:
        text = str(getattr(segment, "text", "")).strip()
        start = getattr(segment, "start", None)
        end = getattr(segment, "end", None)

        if not text or start is None or end is None or end <= start:
            continue

        normalized_segment = {
            "text": text,
            "start": round(float(start), 3),
            "end": round(float(end), 3),
        }

        if include_words:
            words = normalize_words(segment)
            if words:
                normalized_segment["words"] = words

        normalized_segments.append(normalized_segment)
        transcript_lines.append(text)

    return normalized_segments, "\n\n".join(transcript_lines)


def main():
    args = parse_args()
    audio_path = None
    should_cleanup_audio_path = False

    try:
        if args.audio_url:
            audio_path = download_audio(args.audio_url)
            should_cleanup_audio_path = True
        else:
            audio_path = args.audio_path

        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        segments, info = model.transcribe(
            audio_path,
            beam_size=args.beam_size,
            best_of=args.best_of,
            temperature=0.0,
            vad_filter=True,
            word_timestamps=args.word_timestamps,
            condition_on_previous_text=False,
        )
        normalized_segments, text = normalize_segments(segments, args.word_timestamps)
        print(
            json.dumps(
                {
                    "language": getattr(info, "language", None),
                    "duration": round(float(getattr(info, "duration", 0) or 0), 3),
                    "text": text,
                    "segments": normalized_segments,
                }
            )
        )
    finally:
        if should_cleanup_audio_path and audio_path and os.path.exists(audio_path):
            os.unlink(audio_path)


if __name__ == "__main__":
    main()
