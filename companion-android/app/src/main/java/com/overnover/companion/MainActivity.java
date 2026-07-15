package com.overnover.companion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.format.Formatter;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

/**
 * Minimal control panel: start/stop the server and show how to reach it. The
 * heavy lifting lives in CompanionService; this is just a switch and a status
 * readout the user glances at during setup.
 */
public final class MainActivity extends Activity {
    private TextView status;
    private TextView address;
    private Button toggle;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(final Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        status = findViewById(R.id.status);
        address = findViewById(R.id.address);
        toggle = findViewById(R.id.toggle);
        toggle.setOnClickListener(this::onToggle);
        refresh();
    }

    private void onToggle(final View v) {
        final Intent intent = new Intent(this, CompanionService.class);
        if (CompanionService.running) {
            stopService(intent);
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        }
        handler.postDelayed(this::refresh, 600);
    }

    private void refresh() {
        final boolean running = CompanionService.running;
        status.setText(running ? "● Running" : "○ Stopped");
        toggle.setText(running ? "Stop server" : "Start server");
        address.setText("On this Wi-Fi:  http://" + localIp() + ":" + CompanionService.PORT
                + "\n\nThis local address is for setup/testing only. Remote HTTPS access is"
                + " configured separately.");
    }

    private String localIp() {
        try {
            final WifiManager wm =
                    (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            final int ip = wm.getConnectionInfo().getIpAddress();
            if (ip != 0) {
                return Formatter.formatIpAddress(ip);
            }
        } catch (final Exception ignored) {
        }
        return "0.0.0.0";
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }
}
