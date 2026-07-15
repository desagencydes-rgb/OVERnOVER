package com.overnover.companion;

import android.util.Log;

import org.json.JSONArray;
import org.schabi.newpipe.extractor.stream.AudioStream;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * The companion HTTP API. Mirrors the endpoints OVERnOVER's CompanionProvider
 * calls. Search/suggest/related come from NewPipeExtractor; /stream resolves the
 * audio URL then proxies the bytes (forwarding Range) so googlevideo only ever
 * sees this phone's residential IP.
 */
public final class ApiServer extends NanoHTTPD {
    private static final String TAG = "OverApiServer";
    private final OkHttpClient client;

    // Resolved audio URLs cached ~5h; <audio> makes many Range requests per track.
    private static final long CACHE_TTL_MS = 5 * 3600 * 1000L;
    private final Map<String, CachedUrl> streamCache = new HashMap<>();

    private static final class CachedUrl {
        final String url;
        final long expiresAt;
        CachedUrl(final String url, final long expiresAt) {
            this.url = url;
            this.expiresAt = expiresAt;
        }
    }

    public ApiServer(final int port, final OkHttpClient client) {
        super(port);
        this.client = client;
    }

    @Override
    public Response serve(final IHTTPSession session) {
        final String uri = session.getUri();
        try {
            if (uri.equals("/health")) {
                return cors(json("{\"ok\":true}"));
            }
            if (uri.equals("/search")) {
                final String q = param(session, "q");
                final JSONArray arr = q.isEmpty() ? new JSONArray() : Extractor.search(q);
                return cors(json(arr.toString()));
            }
            if (uri.equals("/suggest")) {
                final String q = param(session, "q");
                final JSONArray arr = q.isEmpty() ? new JSONArray() : Extractor.suggest(q);
                return cors(json(arr.toString()));
            }
            if (uri.startsWith("/related/")) {
                final String id = uri.substring("/related/".length());
                return cors(json(Extractor.related(id).toString()));
            }
            if (uri.startsWith("/stream/")) {
                final String id = uri.substring("/stream/".length());
                return cors(streamAudio(id, session));
            }
            return cors(newFixedLengthResponse(Response.Status.NOT_FOUND,
                    "application/json", "{\"error\":\"not found\"}"));
        } catch (final Throwable e) {
            // Throwable, not Exception: an Error (e.g. NoSuchMethodError from an
            // API the old OS lacks) must not kill the server process.
            Log.w(TAG, "serve error on " + uri + ": " + e, e);
            final Response r = newFixedLengthResponse(Response.Status.INTERNAL_ERROR,
                    "application/json", "{\"error\":\"" + safe(String.valueOf(e)) + "\"}");
            return cors(r);
        }
    }

    private String resolveUrl(final String id) throws Exception {
        final long now = System.currentTimeMillis();
        synchronized (streamCache) {
            final CachedUrl cached = streamCache.get(id);
            if (cached != null && cached.expiresAt > now) {
                return cached.url;
            }
        }
        final AudioStream audio = Extractor.bestAudio(id);
        final String url = audio.getContent();
        synchronized (streamCache) {
            streamCache.put(id, new CachedUrl(url, now + CACHE_TTL_MS));
        }
        return url;
    }

    private Response streamAudio(final String id, final IHTTPSession session) throws Exception {
        String url;
        try {
            url = resolveUrl(id);
        } catch (final Throwable e) {
            Log.w(TAG, "resolve failed for " + id + ": " + e, e);
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR,
                    "application/json", "{\"error\":\"extract: " + safe(String.valueOf(e)) + "\"}");
        }

        final String range = session.getHeaders().get("range");
        Response upstream = fetchUpstream(url, range);
        if (upstream == null) {
            // URL may have expired early — drop cache, re-resolve once.
            synchronized (streamCache) {
                streamCache.remove(id);
            }
            url = resolveUrl(id);
            upstream = fetchUpstream(url, range);
        }
        if (upstream == null) {
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR,
                    "application/json", "{\"error\":\"stream failed\"}");
        }
        return upstream;
    }

    /** Returns a NanoHTTPD chunked response streaming googlevideo bytes, or null on failure. */
    private Response fetchUpstream(final String url, final String range) {
        try {
            final Request.Builder rb = new Request.Builder().url(url);
            if (range != null && !range.isEmpty()) {
                rb.header("Range", range);
            }
            final okhttp3.Response resp = client.newCall(rb.build()).execute();
            if (!resp.isSuccessful() && resp.code() != 206) {
                resp.close();
                return null;
            }
            final okhttp3.ResponseBody body = resp.body();
            if (body == null) {
                resp.close();
                return null;
            }
            final InputStream in = body.byteStream();
            final String contentType = resp.header("Content-Type", "audio/mp4");
            final long length = body.contentLength();

            final Response.Status status = resp.code() == 206
                    ? Response.Status.PARTIAL_CONTENT : Response.Status.OK;

            final Response out;
            if (length >= 0) {
                out = newFixedLengthResponse(status, contentType, in, length);
            } else {
                out = newChunkedResponse(status, contentType, in);
            }
            out.addHeader("Accept-Ranges", "bytes");
            final String contentRange = resp.header("Content-Range");
            if (contentRange != null) {
                out.addHeader("Content-Range", contentRange);
            }
            return out;
        } catch (final IOException e) {
            Log.w(TAG, "upstream fetch failed: " + e.getMessage());
            return null;
        }
    }

    private static String param(final IHTTPSession session, final String key) {
        final Map<String, java.util.List<String>> params = session.getParameters();
        if (params.containsKey(key) && !params.get(key).isEmpty()) {
            return params.get(key).get(0);
        }
        return "";
    }

    private static Response json(final String body) {
        return newFixedLengthResponse(Response.Status.OK, "application/json", body);
    }

    private static Response cors(final Response resp) {
        resp.addHeader("Access-Control-Allow-Origin", "*");
        resp.addHeader("Access-Control-Allow-Headers", "Range, Content-Type");
        resp.addHeader("Access-Control-Expose-Headers",
                "Content-Range, Accept-Ranges, Content-Length");
        return resp;
    }

    private static String safe(final String s) {
        return s == null ? "unknown" : s.replace("\"", "'").replace("\\", "");
    }
}
