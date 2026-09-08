// Serving generated speech to <audio> elements.
//
// Two rules the student page depends on:
//   * Safari (desktop and iOS) asks for media with a Range request and refuses
//     to play a source that answers one with the whole file, so ranges are
//     honoured rather than only advertised via Accept-Ranges;
//   * a failure must never reach the element as an HTML/JSON error page — the
//     browser reports that as an unsupported source, which hides the real
//     cause. Callers send an explicit status the client can read instead.

export function sendAudioBuffer(req, res, buffer, cacheControl = 'private, max-age=600') {
  res.set({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl
  });
  const range = parseByteRange(req.get('range'), buffer.length);
  if (range === 'invalid') {
    return res.status(416).set('Content-Range', `bytes */${buffer.length}`).end();
  }
  if (!range) {
    res.set('Content-Length', String(buffer.length));
    return res.end(buffer);
  }
  const slice = buffer.subarray(range.start, range.end + 1);
  res.status(206).set({
    'Content-Range': `bytes ${range.start}-${range.end}/${buffer.length}`,
    'Content-Length': String(slice.length)
  });
  return res.end(slice);
}

// Returns null for "send the whole thing", 'invalid' for an unsatisfiable
// range, or the resolved inclusive byte bounds. A multi-range request also
// falls back to the full body, which is a valid response.
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return 'invalid';
  let start;
  let end;
  if (rawStart) {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  } else {
    const suffix = Number(rawEnd);
    if (!suffix) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}
