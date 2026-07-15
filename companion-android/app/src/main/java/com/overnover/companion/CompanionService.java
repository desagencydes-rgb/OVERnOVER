package com.overnover.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;

/**
 * Keeps the API server alive as a foreground service: a persistent notification
 * (so Android won't kill it), a partial wake lock (CPU runs with the screen off)
 * and a Wi-Fi lock (radio stays up). This is what lets an idle phone on a shelf
 * keep answering the iPhone.
 */
public final class CompanionService extends Service {
    private static final String TAG = "OverService";
    private static final String CHANNEL_ID = "overnover_companion";
    private static final int NOTIF_ID = 1;
    public static final int PORT = 8080;

    private ApiServer server;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    public static volatile boolean running = false;

    @Override
    public void onCreate() {
        super.onCreate();
        final OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
        Extractor.init(client);
        server = new ApiServer(PORT, client);
    }

    @Override
    public int onStartCommand(final Intent intent, final int flags, final int startId) {
        startForeground(NOTIF_ID, buildNotification("Starting…"));
        acquireLocks();
        try {
            if (!server.isAlive()) {
                server.start(NanoTimeouts.SOCKET_READ_TIMEOUT, false);
            }
            running = true;
            updateNotification("Serving on port " + PORT);
            Log.i(TAG, "companion server started on " + PORT);
        } catch (final Exception e) {
            Log.e(TAG, "failed to start server: " + e.getMessage());
            updateNotification("Failed: " + e.getMessage());
        }
        return START_STICKY;
    }

    private void acquireLocks() {
        try {
            final PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "overnover:cpu");
            wakeLock.acquire();
            final WifiManager wm =
                    (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "overnover:wifi");
            wifiLock.acquire();
        } catch (final Exception e) {
            Log.w(TAG, "lock acquire failed: " + e.getMessage());
        }
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (final Exception ignored) {
        }
    }

    private Notification buildNotification(final String text) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            final NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Companion server", NotificationManager.IMPORTANCE_LOW);
            final NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
        final Intent openIntent = new Intent(this, MainActivity.class);
        final PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_IMMUTABLE : 0);

        final Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return b.setContentTitle("OVERnOVER companion")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(final String text) {
        final NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_ID, buildNotification(text));
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (server != null) {
            server.stop();
        }
        releaseLocks();
        super.onDestroy();
        Log.i(TAG, "companion server stopped");
    }

    @Override
    public IBinder onBind(final Intent intent) {
        return null;
    }

    /** NanoHTTPD socket read timeout constants kept in one place. */
    static final class NanoTimeouts {
        static final int SOCKET_READ_TIMEOUT = 60_000;
    }
}
