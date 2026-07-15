package com.overnover.companion;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.StreamingService;
import org.schabi.newpipe.extractor.Image;
import org.schabi.newpipe.extractor.InfoItem.InfoType;
import org.schabi.newpipe.extractor.ListExtractor.InfoItemsPage;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.search.SearchExtractor;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;
import org.schabi.newpipe.extractor.suggestion.SuggestionExtractor;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import okhttp3.OkHttpClient;

/**
 * Thin wrapper over NewPipeExtractor exposing exactly what the OVERnOVER app
 * needs: search, suggest, related, and best-audio-URL resolution. All results
 * are shaped as JSON matching the app's CompanionProvider contract.
 */
public final class Extractor {
    private static final String TAG = "OverExtractor";
    private static boolean initialized = false;
    private static final StreamingService YT = ServiceList.YouTube;

    public static synchronized void init(final OkHttpClient client) {
        if (initialized) {
            return;
        }
        NewPipe.init(new DownloaderImpl(client), new Localization("en", "US"));
        initialized = true;
    }

    private static String bestThumbnail(final List<Image> images) {
        if (images == null || images.isEmpty()) {
            return null;
        }
        // Images are ordered low->high; take the last (highest resolution).
        return images.get(images.size() - 1).getUrl();
    }

    private static String videoIdFromUrl(final String url) {
        if (url == null) {
            return null;
        }
        final int idx = url.indexOf("v=");
        if (idx >= 0) {
            String id = url.substring(idx + 2);
            final int amp = id.indexOf('&');
            if (amp >= 0) {
                id = id.substring(0, amp);
            }
            return id;
        }
        // youtu.be/<id>
        final int slash = url.lastIndexOf('/');
        if (slash >= 0 && slash < url.length() - 1) {
            return url.substring(slash + 1);
        }
        return null;
    }

    private static JSONObject toTrack(final StreamInfoItem item) {
        try {
            final String id = videoIdFromUrl(item.getUrl());
            if (id == null) {
                return null;
            }
            final JSONObject obj = new JSONObject();
            obj.put("id", id);
            obj.put("title", item.getName());
            final String uploader = item.getUploaderName();
            obj.put("artist", uploader == null || uploader.isEmpty() ? "Unknown"
                    : uploader.replaceAll("\\s*-\\s*Topic$", ""));
            obj.put("duration", Math.max(0, item.getDuration()));
            final String thumb = bestThumbnail(item.getThumbnails());
            if (thumb != null) {
                obj.put("thumbnail", thumb);
            }
            return obj;
        } catch (final Exception e) {
            return null;
        }
    }

    public static JSONArray search(final String query) throws Exception {
        JSONArray out = searchWithFilter(query, "music_songs");
        if (out.length() == 0) {
            out = searchWithFilter(query, "videos");
        }
        return out;
    }

    private static JSONArray searchWithFilter(final String query, final String filter)
            throws Exception {
        final SearchExtractor se =
                YT.getSearchExtractor(query, Collections.singletonList(filter), "");
        se.fetchPage();
        final InfoItemsPage<InfoItem> page = se.getInitialPage();
        final JSONArray arr = new JSONArray();
        for (final InfoItem item : page.getItems()) {
            if (item.getInfoType() == InfoType.STREAM && item instanceof StreamInfoItem) {
                final JSONObject t = toTrack((StreamInfoItem) item);
                if (t != null) {
                    arr.put(t);
                }
            }
        }
        return arr;
    }

    public static JSONArray suggest(final String query) {
        try {
            final SuggestionExtractor sug = YT.getSuggestionExtractor();
            final List<String> list = sug.suggestionList(query);
            return new JSONArray(list);
        } catch (final Exception e) {
            return new JSONArray();
        }
    }

    public static JSONArray related(final String videoId) {
        try {
            final StreamInfo info = StreamInfo.getInfo(YT,
                    "https://www.youtube.com/watch?v=" + videoId);
            final JSONArray arr = new JSONArray();
            final List<InfoItem> items = info.getRelatedItems();
            if (items == null) {
                return arr;
            }
            for (final InfoItem item : items) {
                if (item instanceof StreamInfoItem) {
                    final JSONObject t = toTrack((StreamInfoItem) item);
                    if (t != null && !videoId.equals(t.optString("id"))) {
                        arr.put(t);
                    }
                }
            }
            return arr;
        } catch (final Exception e) {
            Log.w(TAG, "related failed: " + e.getMessage());
            return new JSONArray();
        }
    }

    /** Resolves the best playable audio stream URL (direct googlevideo, IP-locked). */
    public static AudioStream bestAudio(final String videoId) throws Exception {
        final StreamInfo info = StreamInfo.getInfo(YT,
                "https://www.youtube.com/watch?v=" + videoId);
        final List<AudioStream> audios = new ArrayList<>(info.getAudioStreams());
        if (audios.isEmpty()) {
            throw new Exception("no audio streams");
        }
        // Prefer m4a (AAC) for universal playback, highest bitrate within that.
        AudioStream best = null;
        for (final AudioStream a : audios) {
            if (a.getFormat() != null && "m4a".equalsIgnoreCase(a.getFormat().getSuffix())) {
                if (best == null || a.getAverageBitrate() > best.getAverageBitrate()) {
                    best = a;
                }
            }
        }
        if (best == null) {
            Collections.sort(audios, (x, y) -> y.getAverageBitrate() - x.getAverageBitrate());
            best = audios.get(0);
        }
        return best;
    }
}
