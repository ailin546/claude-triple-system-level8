#!/usr/bin/env node
/**
 * Shared lesson/decision extraction from transcript JSONL.
 *
 * Used by both stop-summary.js (Stop hook) and pre-compact.js (PreCompact hook)
 * to avoid duplicating the extraction logic.
 *
 * Dedup is handled by seen-lessons.json (7-day TTL), so extracting at compact
 * time does NOT cause double-recording at Stop time.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./utils');

// ── Helpers ──────────────────────────────────────────────────

/**
 * Clean a lesson string: strip markdown formatting, normalize whitespace.
 */
function cleanLesson(raw) {
  return raw
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract dedup key: LEFT side of → (problem description).
 */
function lessonKey(cleaned) {
  const match = cleaned.match(/^(.+?)(?:→|-{1,2}>)/);
  if (!match) return cleaned.toLowerCase();
  return match[1].trim().toLowerCase();
}

// ── Seen-lessons persistence ────────────────────────────────

function getSeenLessonsPath(sessionStateDir) {
  return path.join(sessionStateDir, 'seen-lessons.json');
}

function loadSeenLessonKeys(sessionStateDir) {
  try {
    const file = getSeenLessonsPath(sessionStateDir);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const valid = (data.entries || []).filter(e => (e.ts || 0) > cutoff);
      return new Set(valid.map(e => e.key));
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveSeenLessonKeys(sessionStateDir, keys) {
  try {
    ensureDir(sessionStateDir);
    const file = getSeenLessonsPath(sessionStateDir);
    const now = Date.now();
    let existing = [];
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        existing = data.entries || [];
      } catch { /* ignore */ }
    }
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    const merged = new Map();
    for (const e of existing) {
      if ((e.ts || 0) > cutoff) merged.set(e.key, e.ts);
    }
    for (const k of keys) {
      merged.set(k, now);
    }
    const entries = [...merged.entries()].map(([key, ts]) => ({ key, ts }));
    fs.writeFileSync(file, JSON.stringify({ entries }), 'utf8');
  } catch { /* ignore */ }
}

// ── Transcript scanning ─────────────────────────────────────

const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

/**
 * Extract lessons and decisions from a transcript JSONL file.
 *
 * @param {string} transcriptPath - Path to JSONL transcript file
 * @param {Set<string>} seenKeys - Already-extracted lesson keys (from seen-lessons.json)
 * @returns {{ lessons: string[], decisions: string[] }}
 */
function extractFromTranscript(transcriptPath, seenKeys) {
  const lessons = [];
  const decisions = [];

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { lessons, decisions };
  }

  try {
    const stat = fs.statSync(transcriptPath);
    let raw;
    if (stat.size > MAX_TRANSCRIPT_BYTES) {
      const fd = fs.openSync(transcriptPath, 'r');
      const buf = Buffer.alloc(MAX_TRANSCRIPT_BYTES);
      fs.readSync(fd, buf, 0, MAX_TRANSCRIPT_BYTES, stat.size - MAX_TRANSCRIPT_BYTES);
      fs.closeSync(fd);
      const text = buf.toString('utf8');
      raw = text.substring(text.indexOf('\n') + 1);
    } else {
      raw = fs.readFileSync(transcriptPath, 'utf8');
    }

    for (const jsonLine of raw.split('\n')) {
      if (!jsonLine.trim()) continue;
      let entry;
      try { entry = JSON.parse(jsonLine); } catch { continue; }

      if (entry.type !== 'assistant') continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type !== 'text' || !block.text) continue;

        let inLessonsSection = false;
        let inDecisionsSection = false;

        for (const line of block.text.split('\n')) {
          const trimmed = line.trim();

          // Strict section header matching
          const isLessonsHdr = /^\*{2}Lessons:?\*{2}$/.test(trimmed)
            || /^#{1,4}\s+Lessons:?\s*$/.test(trimmed);
          const isDecisionsHdr = /^\*{2}Decisions?:?\*{2}$/.test(trimmed)
            || /^\*{2}决策:?\*{2}$/.test(trimmed)
            || /^#{1,4}\s+Decisions?:?\s*$/.test(trimmed);

          if (isLessonsHdr) { inLessonsSection = true; inDecisionsSection = false; continue; }
          if (isDecisionsHdr) { inDecisionsSection = true; inLessonsSection = false; continue; }

          // Non-bullet, non-blank line ends the current section
          if ((inLessonsSection || inDecisionsSection) && trimmed !== '' && !/^[-*]\s/.test(trimmed)) {
            inLessonsSection = false; inDecisionsSection = false;
          }

          if (inLessonsSection) {
            const lessonMatch = trimmed.match(/^[-*]\s+(.+(?:→|-{1,2}>).+)$/);
            if (lessonMatch && lessonMatch[1].length >= 15) {
              const cleaned = cleanLesson(lessonMatch[1]);
              const key = lessonKey(cleaned);
              if (seenKeys.has(key)) continue;
              if (lessons.some(l => lessonKey(l) === key)) continue;
              lessons.push(cleaned);
            }
          }

          if (inDecisionsSection) {
            const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
            if (bulletMatch) {
              const d = cleanLesson(bulletMatch[1]);
              if (d.length >= 10 && !decisions.includes(d)) decisions.push(d);
            }
          }
        }
      }
    }
  } catch { /* non-blocking */ }

  return { lessons, decisions };
}

// ── Commit dedup ────────────────────────────────────────────

/**
 * Filter out commits whose short-hash already appears in today.md.
 *
 * Root cause this fixes: stop-summary.js (autoRecordSessionFacts) and
 * periodic-memory.js both run `git log --since=session_start` (the FULL
 * session window) on EVERY trigger. Stop fires multiple times per session
 * and periodic fires every 30min, so the same commits were appended N times
 * → today.md bloats → rotation carries the dupes into weekly.md (observed
 * 86% redundancy, weekly.md 129KB with only 172 unique lines).
 *
 * Lessons already had seen-lessons.json dedup; commits had no equivalent.
 * This is that equivalent: dedup against what's already in today.md.
 *
 * @param {string[]} commits - commit lines, each "hash subject ..."
 * @param {string} todayFilePath - absolute path to the relevant today.md
 * @returns {string[]} only commits whose hash is not already recorded today
 */
function filterNewCommits(commits, todayFilePath) {
  if (!Array.isArray(commits) || commits.length === 0) return commits;
  let existing = '';
  try {
    if (fs.existsSync(todayFilePath)) {
      existing = fs.readFileSync(todayFilePath, 'utf8');
    }
  } catch { return commits; }
  if (!existing) return commits;

  // Existing commit/fix lines look like:  - `abc1234 subject`
  // Anchor on the bullet + backtick so we don't match inline code in lessons.
  const existingHashes = new Set();
  for (const m of existing.matchAll(/^\s*-\s+`([0-9a-f]{7,40})\s/gm)) {
    existingHashes.add(m[1]);
  }
  if (existingHashes.size === 0) return commits;

  return commits.filter(c => {
    const hash = String(c).split(/\s/)[0];
    return !existingHashes.has(hash);
  });
}

module.exports = {
  cleanLesson,
  lessonKey,
  filterNewCommits,
  loadSeenLessonKeys,
  saveSeenLessonKeys,
  extractFromTranscript,
};
