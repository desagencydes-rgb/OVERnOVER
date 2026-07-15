package com.overnover.companion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

/**
 * Minimal control panel: enter the relay URL, start/stop the server, and see
 * whether the relay is online. The heavy lifting lives in CompanionService.
 */
public final class MainActivity extends Activity {
    private TextView status;
    private TextView address;
    private EditText workerUrl;
    private Button toggle;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(final Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        status = findViewById(R.id.status);
        address = findViewById(R.id.address);
        workerUrl = findViewById(R.id.workerUrl);
        toggle = findViewById(R.id.toggle);
        toggle.setOnClickListener(this::onToggle);
        address.setOnClickListener(v -> copyUrl());

        workerUrl.setText(prefs().getString(CompanionService.KEY_WORKER_URL, ""));
        refresh();
    }

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences(CompanionService.PREFS, Context.MODE_PRIVATE);
    }

    private void onToggle(final View v) {
        final Intent intent = new Intent(this, CompanionService.class);
        if (CompanionService.running) {
            stopService(intent);
        } else {
            // Persist the relay URL before starting so the service picks it up.
            final String url = workerUrl.getText().toString().trim();
            prefs().edit().putString(CompanionService.KEY_WORKER_URL, url).apply();
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
        workerUrl.setEnabled(!running);

        final String url = CompanionService.publicUrl;
        if (url != null) {
            address.setText("● Online.\n\nPaste this into the OVERnOVER app"
                    + " (Settings → Companion server):\n\n" + url
                    + "\n\nTap to copy.");
        } else if (running) {
            address.setText("Server running locally.\nRelay: " + CompanionService.tunnelStatus);
        } else {
            address.setText("Enter your relay URL, then Start.");
        }

        if (running) {
            handler.postDelayed(this::refresh, 1500);
        }
    }

    private void copyUrl() {
        final String url = CompanionService.publicUrl;
        if (url == null) {
            return;
        }
        final android.content.ClipboardManager cb =
                (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (cb != null) {
            cb.setPrimaryClip(android.content.ClipData.newPlainText("companion", url));
            android.widget.Toast.makeText(this, "URL copied", android.widget.Toast.LENGTH_SHORT)
                    .show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }
}
