package com.overnover.companion;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import okhttp3.OkHttpClient;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;

/**
 * Minimal OkHttp-backed Downloader for NewPipeExtractor. Kept close to the
 * upstream NewPipe implementation so extractor behaviour matches what the
 * library expects.
 */
public final class DownloaderImpl extends Downloader {
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private final OkHttpClient client;

    public DownloaderImpl(final OkHttpClient client) {
        this.client = client;
    }

    @Override
    public Response execute(final Request request) throws IOException, ReCaptchaException {
        final String httpMethod = request.httpMethod();
        final String url = request.url();
        final Map<String, List<String>> headers = request.headers();
        final byte[] dataToSend = request.dataToSend();

        RequestBody requestBody = null;
        if (dataToSend != null) {
            requestBody = RequestBody.create(null, dataToSend);
        }

        final okhttp3.Request.Builder builder = new okhttp3.Request.Builder()
                .method(httpMethod, requestBody)
                .url(url)
                .addHeader("User-Agent", USER_AGENT);

        for (final Map.Entry<String, List<String>> pair : headers.entrySet()) {
            final String headerName = pair.getKey();
            final List<String> headerValueList = pair.getValue();
            if (headerValueList.size() > 1) {
                builder.removeHeader(headerName);
                for (final String headerValue : headerValueList) {
                    builder.addHeader(headerName, headerValue);
                }
            } else if (headerValueList.size() == 1) {
                builder.header(headerName, headerValueList.get(0));
            }
        }

        final okhttp3.Response response = client.newCall(builder.build()).execute();

        if (response.code() == 429) {
            response.close();
            throw new ReCaptchaException("reCaptcha Challenge requested", url);
        }

        final ResponseBody body = response.body();
        String responseBodyToReturn = null;
        if (body != null) {
            responseBodyToReturn = body.string();
        }

        final String latestUrl = response.request().url().toString();
        return new Response(
                response.code(),
                response.message(),
                response.headers().toMultimap(),
                responseBodyToReturn,
                latestUrl);
    }
}
