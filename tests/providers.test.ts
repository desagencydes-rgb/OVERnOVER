import { afterEach, describe, expect, it, vi } from 'vitest'
import { PipedProvider, pickAudioStream, pickMuxedStream } from '../src/core/providers/piped'
import {
  InvidiousProvider,
  pickAudioFormat,
  pickMuxedFormat,
} from '../src/core/providers/invidious'
import { cleanArtist, videoIdFromUrl } from '../src/core/providers/types'

function mockFetchJson(payloads: unknown[]) {
  let call = 0
  return vi.fn(async () => ({
    ok: true,
    json: async () => payloads[Math.min(call++, payloads.length - 1)],
  })) as unknown as typeof fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('PipedProvider', () => {
  it('normalizes search results to tracks', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([
        {
          items: [
            {
              url: '/watch?v=abc123def45',
              type: 'stream',
              title: ' Some Song ',
              uploaderName: 'Artist - Topic',
              duration: 215,
            },
            { url: '/playlist?list=x', type: 'playlist', title: 'skip me' },
            { type: 'stream', title: 'no url — skipped' },
          ],
        },
      ]),
    )
    const tracks = await new PipedProvider('https://p.example').search('some song')
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({
      id: 'abc123def45',
      title: 'Some Song',
      artist: 'Artist',
      durationSec: 215,
    })
    expect(tracks[0].thumbnailUrl).toContain('abc123def45')
  })

  it('falls back to the videos filter when music search is empty', async () => {
    const fetchMock = mockFetchJson([
      { items: [] },
      { items: [{ url: '/watch?v=xyz987xyz98', type: 'stream', title: 'Found', duration: 10 }] },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const tracks = await new PipedProvider('https://p.example').search('rare thing')
    expect(tracks).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('picks AAC/MP4 over higher-bitrate WebM (iOS compatibility)', () => {
    const picked = pickAudioStream([
      { url: 'webm', mimeType: 'audio/webm', bitrate: 160_000 },
      { url: 'm4a', mimeType: 'audio/mp4', bitrate: 128_000 },
    ])
    expect(picked?.url).toBe('m4a')
  })

  it('falls back to WebM when no MP4 exists', () => {
    const picked = pickAudioStream([{ url: 'webm', mimeType: 'audio/webm', bitrate: 160_000 }])
    expect(picked?.url).toBe('webm')
  })

  it('falls back to the smallest real muxed MP4 when audioStreams is empty (2026 reality)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([
        {
          audioStreams: [],
          videoStreams: [
            { url: 'lbry', mimeType: 'video/mp4', itag: -1, quality: 'LBRY', videoOnly: false },
            { url: 'hls', mimeType: 'application/x-mpegurl', itag: -1, quality: 'LBRY HLS', videoOnly: false },
            { url: 'muxed720', mimeType: 'video/mp4', itag: 22, quality: '720p', videoOnly: false },
            { url: 'muxed360', mimeType: 'video/mp4', itag: 18, quality: '360p', videoOnly: false },
            { url: 'videoonly', mimeType: 'video/mp4', itag: 137, quality: '1080p', videoOnly: true },
          ],
        },
      ]),
    )
    const info = await new PipedProvider('https://p.example').streamInfo('vid')
    expect(info.url).toBe('muxed360')
    expect(info.mime).toBe('video/mp4')
  })

  it('pickMuxedStream rejects LBRY/HLS/video-only entries', () => {
    expect(
      pickMuxedStream([
        { url: 'lbry', mimeType: 'video/mp4', itag: -1, quality: 'LBRY', videoOnly: false },
        { url: 'videoonly', mimeType: 'video/mp4', itag: 137, quality: '1080p', videoOnly: true },
      ]),
    ).toBeNull()
  })
})

describe('InvidiousProvider', () => {
  it('normalizes search results', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([
        [
          { type: 'video', videoId: 'vid456vid45', title: 'Track', author: 'Someone', lengthSeconds: 100 },
          { type: 'channel', title: 'skip' },
        ],
      ]),
    )
    const tracks = await new InvidiousProvider('https://i.example').search('track')
    expect(tracks).toHaveLength(1)
    expect(tracks[0].id).toBe('vid456vid45')
  })

  it('builds stream info from adaptive formats, absolutizing relative URLs', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([
        {
          adaptiveFormats: [
            { url: '/videoplayback?x=1', type: 'audio/mp4; codecs="mp4a.40.2"', bitrate: '128000' },
            { url: 'https://full/webm', type: 'audio/webm; codecs="opus"', bitrate: '160000' },
          ],
        },
      ]),
    )
    const info = await new InvidiousProvider('https://i.example').streamInfo('vid')
    expect(info.url).toBe('https://i.example/videoplayback?x=1')
    expect(info.mime).toBe('audio/mp4')
    expect(info.fromInstance).toBe('https://i.example')
  })

  it('prefers mp4 audio regardless of bitrate', () => {
    const picked = pickAudioFormat([
      { url: 'a', type: 'audio/webm; codecs="opus"', bitrate: '999999' },
      { url: 'b', type: 'audio/mp4; codecs="mp4a.40.2"', bitrate: '128000' },
      { url: 'c', type: 'video/mp4', bitrate: '2000000' },
    ])
    expect(picked?.url).toBe('b')
  })

  it('falls back to muxed formatStreams when adaptiveFormats has no audio', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([
        {
          adaptiveFormats: [{ url: 'v', type: 'video/mp4; codecs="avc1"', bitrate: '900000' }],
          formatStreams: [
            { url: '/proxied?itag=22', type: 'video/mp4; codecs="avc1,mp4a"', itag: 22, resolution: '720p' },
            { url: '/proxied?itag=18', type: 'video/mp4; codecs="avc1,mp4a"', itag: 18, resolution: '360p' },
          ],
        },
      ]),
    )
    const info = await new InvidiousProvider('https://i.example').streamInfo('vid')
    expect(info.url).toBe('https://i.example/proxied?itag=18')
    expect(info.mime).toBe('video/mp4')
  })

  it('pickMuxedFormat picks the lowest resolution mp4', () => {
    const picked = pickMuxedFormat([
      { url: 'hi', type: 'video/mp4', resolution: '720p' },
      { url: 'lo', type: 'video/mp4', resolution: '360p' },
      { url: 'webm', type: 'video/webm', resolution: '144p' },
    ])
    expect(picked?.url).toBe('lo')
  })
})

describe('helpers', () => {
  it('extracts video ids from watch urls', () => {
    expect(videoIdFromUrl('/watch?v=abc&list=x')).toBe('abc')
    expect(videoIdFromUrl('/nothing')).toBeNull()
  })
  it('strips " - Topic" from auto-generated channels', () => {
    expect(cleanArtist('Daft Punk - Topic')).toBe('Daft Punk')
    expect(cleanArtist('Regular Channel')).toBe('Regular Channel')
  })
})
