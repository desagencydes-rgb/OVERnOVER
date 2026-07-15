package com.overnover.companion;

import android.util.Log;

import org.json.JSONObject;

import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * Connects OUTBOUND to the OVERnOVER relay Worker over a WebSocket and serves the
 * local API through it. Outbound WS uses Android's own networking stack, so it
 * works on old rootless phones where the Cloudflare/ngrok Go binaries can't
 * resolve DNS. The Worker gives a stable https://<name>.workers.dev address.
 */
public final class RelayClient {
    private static final String TAG = "OverRelay";
    private static final int CHUNK = 32 * 1024;
    private static final long MAX_QUEUE = 4L * 1024 * 1024; // backpressure ceiling

    public interface Listener {
        void onStatus(String status);
    }

    private final String baseUrl;
    private final int localPort;
    private final Listener listener;
    private final OkHttpClient wsClient;
    private final OkHttpClient localClient;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    /** In-flight local calls by request id, so a client abort (seek) can cancel them. */
    private final ConcurrentHashMap<Integer, Call> active = new ConcurrentHashMap<>();

    private volatile boolean running = false;
    private volatile WebSocket socket;
    private long backoff = 2000;

    public RelayClient(final String baseUrl, final int localPort, final Listener listener) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.localPort = localPort;
        this.listener = listener;
        this.wsClient = new OkHttpClient.Builder()
                .pingInterval(20, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build();
        this.localClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .build();
    }

    private String wsUrl() {
        String u = baseUrl;
        if (u.startsWith("https://")) {
            u = "wss://" + u.substring("https://".length());
        } else if (u.startsWith("http://")) {
            u = "ws://" + u.substring("http://".length());
        }
        return u + "/__connect";
    }

    public void start() {
        running = true;
        connect();
    }

    public void stop() {
        running = false;
        final WebSocket s = socket;
        if (s != null) {
            s.close(1000, "bye");
        }
        pool.shutdownNow();
    }

    private void connect() {
        if (!running) {
            return;
        }
        listener.onStatus("connecting…");
        final Request req = new Request.Builder().url(wsUrl()).build();
        socket = wsClient.newWebSocket(req, new WebSocketListener() {
            @Override
            public void onOpen(final WebSocket ws, final Response response) {
                backoff = 2000;
                listener.onStatus("online");
                Log.i(TAG, "relay connected");
            }

            @Override
            public void onMessage(final WebSocket ws, final String text) {
                try {
                    final JSONObject msg = new JSONObject(text);
                    final String t = msg.optString("t");
                    if ("req".equals(t)) {
                        pool.execute(() -> handleRequest(ws, msg));
                    } else if ("cancel".equals(t)) {
                        final Call c = active.get(msg.optInt("id", -1));
                        if (c != null) {
                            c.cancel();
                        }
                    }
                } catch (final Exception e) {
                    Log.w(TAG, "bad message: " + e);
                }
            }

            @Override
            public void onFailure(final WebSocket ws, final Throwable t, final Response response) {
                Log.w(TAG, "relay failure: " + t);
                scheduleReconnect(t.getClass().getSimpleName());
            }

            @Override
            public void onClosed(final WebSocket ws, final int code, final String reason) {
                scheduleReconnect("closed");
            }
        });
    }

    private void scheduleReconnect(final String why) {
        if (!running) {
            listener.onStatus("stopped");
            return;
        }
        listener.onStatus("reconnecting… (" + why + ")");
        try {
            Thread.sleep(backoff);
        } catch (final InterruptedException e) {
            return;
        }
        backoff = Math.min(backoff * 2, 60_000);
        connect();
    }

    private void handleRequest(final WebSocket ws, final JSONObject msg) {
        int id = -1;
        Call call = null;
        boolean isStream = false;
        boolean headSent = false;
        try {
            id = msg.getInt("id");
            final String path = msg.getString("path");
            final JSONObject headers = msg.optJSONObject("headers");
            isStream = path.startsWith("/stream/");

            final Request.Builder rb = new Request.Builder()
                    .url("http://127.0.0.1:" + localPort + path);
            if (headers != null && headers.has("range")) {
                rb.header("Range", headers.getString("range"));
            }
            call = localClient.newCall(rb.build());

            if (isStream) {
                // A new stream supersedes any previous one — the player streams a
                // single track at a time, and an iOS seek opens a fresh request.
                // Cancelling the old stream stops it clogging the relay socket
                // (which is what made seeking play silently).
                for (final Call prev : active.values()) {
                    prev.cancel();
                }
                active.put(id, call);
            }

            try (Response resp = call.execute()) {
                final JSONObject head = new JSONObject();
                head.put("t", "head");
                head.put("id", id);
                head.put("status", resp.code());
                final JSONObject hOut = new JSONObject();
                copyHeader(resp, hOut, "Content-Type");
                copyHeader(resp, hOut, "Content-Length");
                copyHeader(resp, hOut, "Content-Range");
                copyHeader(resp, hOut, "Accept-Ranges");
                head.put("headers", hOut);
                ws.send(head.toString());
                headSent = true;

                final ResponseBody body = resp.body();
                if (body != null) {
                    streamBody(ws, id, body.byteStream());
                }
            }
            ws.send(endFrame(id));
        } catch (final Throwable t) {
            final boolean cancelled = call != null && call.isCanceled();
            if (headSent) {
                // Head already sent; tell the relay to finish so it frees the request.
                try {
                    ws.send(endFrame(id));
                } catch (final Throwable ignored) {
                    /* socket gone */
                }
            } else if (id >= 0) {
                if (!cancelled) {
                    Log.w(TAG, "request " + id + " failed: " + t);
                }
                try {
                    ws.send(errFrame(id, cancelled ? "superseded" : String.valueOf(t)));
                } catch (final Throwable ignored) {
                    /* socket gone */
                }
            }
        } finally {
            if (isStream && id >= 0) {
                active.remove(id);
            }
        }
    }

    private void streamBody(final WebSocket ws, final int id, final InputStream in) throws Exception {
        final byte[] buf = new byte[CHUNK];
        int n;
        while ((n = in.read(buf)) != -1) {
            if (n == 0) {
                continue;
            }
            final ByteBuffer framed = ByteBuffer.allocate(4 + n);
            framed.putInt(id); // big-endian
            framed.put(buf, 0, n);
            if (!ws.send(ByteString.of(framed.array()))) {
                throw new Exception("socket closed mid-stream");
            }
            // Backpressure: don't let a slow client balloon memory on a weak phone.
            long waited = 0;
            while (ws.queueSize() > MAX_QUEUE && waited < 30_000) {
                Thread.sleep(25);
                waited += 25;
            }
        }
    }

    private static void copyHeader(final Response resp, final JSONObject out, final String name)
            throws Exception {
        final String v = resp.header(name);
        if (v != null) {
            out.put(name.toLowerCase(), v);
        }
    }

    private static String endFrame(final int id) throws Exception {
        return new JSONObject().put("t", "end").put("id", id).toString();
    }

    private static String errFrame(final int id, final String msg) throws Exception {
        return new JSONObject().put("t", "err").put("id", id).put("msg", msg).toString();
    }
}
