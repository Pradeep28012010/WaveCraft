/**
 * Universal External Playlist Importer.
 * Resolves playlists from Spotify (API pagination & embed), YouTube/YouTube Music,
 * and Apple Music into standardized track query batches.
 */

export async function importExternalPlaylist(playlistUrl) {
  if (!playlistUrl) return { error: 'Missing playlist URL' };

  let targetUrl = playlistUrl.trim();

  // Handle Spotify shortlinks (e.g., https://spotify.link/AbCdEf123)
  if (targetUrl.includes('spotify.link/')) {
    try {
      const red = await fetch(targetUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (red.url) targetUrl = red.url;
    } catch {}
  }

  // 1. Spotify Playlist / Album / Track Link
  if (targetUrl.includes('spotify.com') || targetUrl.startsWith('spotify:')) {
    const typeMatch =
      targetUrl.match(/spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:user\/[^/]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/i) ||
      targetUrl.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);

    if (typeMatch) {
      const [, entityType, id] = typeMatch;
      const embedUrl = `https://open.spotify.com/embed/${entityType}/${id}`;
      try {
        const r = await fetch(embedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (r.ok) {
          const html = await r.text();
          const idx = html.indexOf('__NEXT_DATA__');
          if (idx !== -1) {
            const start = html.indexOf('>', idx) + 1;
            const end = html.indexOf('</script>', start);
            const json = JSON.parse(html.slice(start, end));
            const entity = json?.props?.pageProps?.state?.data?.entity;
            const accessToken = json?.props?.pageProps?.state?.settings?.session?.accessToken;

            if (entity) {
              const name = entity.name || entity.title || 'Imported Playlist';
              const images = Array.isArray(entity.visualIdentity?.image)
                ? [...entity.visualIdentity.image].sort(
                    (a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0)
                  )
                : [];
              const rawCover = images[0]?.url || '';
              const coverUrl = rawCover
                .replace('ab67706f00000001', 'ab67706f00000003')
                .replace('ab67706f00000002', 'ab67706f00000003')
                .replace('ab67616d00004851', 'ab67616d0000b273')
                .replace('ab67616d00001e02', 'ab67616d0000b273');
              const trackList = entity.trackList || [];
              const queries = trackList.map((t) => ({
                title: t.title,
                artist: (t.subtitle || '').replace(/\u00a0/g, ' ')
              }));

              // If playlist has more than 100 tracks and session token is available, paginate through remaining tracks
              if (entityType === 'playlist' && accessToken && trackList.length >= 100) {
                try {
                  let nextOffset = trackList.length;
                  let keepFetching = true;
                  while (keepFetching && nextOffset < 1000) {
                    const apiRes = await fetch(
                      `https://api.spotify.com/v1/playlists/${id}/tracks?offset=${nextOffset}&limit=100`,
                      {
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                      }
                    );
                    if (!apiRes.ok) break;
                    const pageData = await apiRes.json();
                    const items = pageData?.items || [];
                    if (items.length === 0) break;
                    for (const item of items) {
                      const tr = item?.track;
                      if (tr?.name) {
                        const artists = Array.isArray(tr.artists)
                          ? tr.artists.map((a) => a.name).filter(Boolean).join(', ')
                          : '';
                        queries.push({
                          title: tr.name,
                          artist: artists
                        });
                      }
                    }
                    nextOffset += items.length;
                    if (!pageData.next || items.length < 100) {
                      keepFetching = false;
                    }
                  }
                } catch {}
              }

              if (queries.length > 0) {
                return {
                  platform: 'Spotify',
                  name,
                  coverUrl,
                  queries
                };
              }
            }
          }
        }
      } catch (err) {
        console.warn('Spotify embed fetch failed:', err);
      }
    }
  }

  // 2. YouTube / YouTube Music Playlist Link
  if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
    const listMatch = targetUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    const ytClientContext = {
      client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' }
    };

    if (listMatch) {
      const listId = listMatch[1];

      // 2A: YouTube Mix (list=RD...)
      if (listId.startsWith('RD')) {
        const vMatch = targetUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
        const videoId = vMatch ? vMatch[1] : (listId.length >= 13 ? listId.slice(2, 13) : undefined);
        try {
          const nextRes = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: ytClientContext,
              playlistId: listId,
              ...(videoId ? { videoId } : {})
            })
          });
          if (nextRes.ok) {
            const nextData = await nextRes.json();
            const playlist = nextData?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
            const mixTitle = playlist?.title || 'YouTube Mix';
            const items = playlist?.contents || [];
            const queries = [];
            for (const it of items) {
              const pv = it?.playlistPanelVideoRenderer;
              if (pv && pv.videoId) {
                const fullTitle = pv.title?.simpleText || pv.title?.runs?.[0]?.text || '';
                const artist = pv.shortBylineText?.simpleText || pv.shortBylineText?.runs?.[0]?.text || '';
                queries.push({
                  title: fullTitle,
                  artist,
                  videoId: pv.videoId
                });
              }
            }
            if (queries.length > 0) {
              return {
                platform: 'YouTube',
                name: mixTitle,
                coverUrl: `https://i.ytimg.com/vi/${queries[0].videoId}/hqdefault.jpg`,
                queries
              };
            }
          }
        } catch (err) {
          console.warn('YouTube Mix next fetch failed:', err);
        }
      }

      // 2B: Standard YouTube / YouTube Music playlist or album
      try {
        const browseId = listId.startsWith('VL') ? listId : `VL${listId}`;
        const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: ytClientContext,
            browseId
          })
        });

        if (r.ok) {
          const data = await r.json();
          const title =
            data?.header?.playlistHeaderRenderer?.title?.simpleText ||
            data?.metadata?.playlistMetadataRenderer?.title ||
            'Imported YouTube Playlist';

          const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
          const sectionContents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

          let initialItems = [];
          for (const sec of sectionContents) {
            const listItems =
              sec?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents ||
              sec?.itemSectionRenderer?.contents ||
              [];
            initialItems.push(...listItems);
          }

          const queries = [];
          const extractFromItems = (items) => {
            let token = null;
            for (const item of items) {
              // Format A: Modern YouTube lockupViewModel (2024/2025/2026)
              const vm = item.lockupViewModel;
              if (vm) {
                const videoId =
                  vm.contentId ||
                  vm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
                const songTitle =
                  vm.metadata?.lockupMetadataViewModel?.title?.content ||
                  vm.rendererContext?.accessibilityContext?.label ||
                  '';
                const artist =
                  vm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
                    ?.metadataParts?.[0]?.text?.content || '';
                if (videoId && songTitle) {
                  queries.push({
                    title: songTitle,
                    artist,
                    videoId
                  });
                }
              }

              // Format B: Legacy playlistVideoRenderer
              const pv = item.playlistVideoRenderer;
              if (pv && pv.videoId) {
                queries.push({
                  title: pv.title?.runs?.[0]?.text || pv.title?.simpleText || '',
                  artist: pv.shortBylineText?.runs?.[0]?.text || '',
                  videoId: pv.videoId
                });
              }

              // Continuation Token (both formats)
              const cont =
                item.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token ||
                item.continuationItemViewModel?.continuationEndpoint?.continuationCommand?.token ||
                item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (cont) token = cont;
            }
            return token;
          };

          let nextToken = extractFromItems(initialItems);

          if (!nextToken) {
            for (const sec of sectionContents) {
              const cont =
                sec?.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token ||
                sec?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (cont) {
                nextToken = cont;
                break;
              }
            }
          }

          let pageCount = 0;
          while (nextToken && pageCount < 10) {
            pageCount++;
            try {
              const contRes = await fetch(
                'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    context: ytClientContext,
                    continuation: nextToken
                  })
                }
              );
              if (!contRes.ok) break;
              const contData = await contRes.json();
              const actions = contData?.onResponseReceivedActions || [];
              const appended = actions[0]?.appendContinuationItemsAction?.continuationItems || [];
              if (appended.length === 0) break;
              let foundNext = null;
              for (const appItem of appended) {
                if (appItem.itemSectionRenderer?.contents) {
                  const t = extractFromItems(appItem.itemSectionRenderer.contents);
                  if (t) foundNext = t;
                } else {
                  const t = extractFromItems([appItem]);
                  if (t) foundNext = t;
                }
              }
              nextToken = foundNext;
            } catch {
              break;
            }
          }

          if (queries.length > 0) {
            return {
              platform: 'YouTube',
              name: title,
              coverUrl: queries[0]?.videoId
                ? `https://i.ytimg.com/vi/${queries[0].videoId}/hqdefault.jpg`
                : '',
              queries
            };
          }
        }
      } catch (err) {
        console.warn('YouTubei playlist browse failed:', err);
      }
    }

    // Fallback for single YouTube video links (e.g. https://youtu.be/XYZ or https://www.youtube.com/watch?v=XYZ)
    const singleMatch = targetUrl.match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (singleMatch) {
      const videoId = singleMatch[1];
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          return {
            platform: 'YouTube',
            name: oembed.title || 'Imported Song',
            coverUrl: oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            queries: [
              {
                title: oembed.title || 'Imported Song',
                artist: oembed.author_name || 'YouTube',
                videoId
              }
            ]
          };
        }
      } catch {}
    }
  }

  // 3. Apple Music / iTunes Album Link
  if (targetUrl.includes('apple.com')) {
    const albumMatch = targetUrl.match(/album\/(?:[^\/]+\/)?(\d+)/i) || targetUrl.match(/[?&]i=(\d+)/i);
    if (albumMatch) {
      const id = albumMatch[1];
      try {
        const itunesRes = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song`);
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json();
          const results = itunesData?.results || [];
          if (results.length > 0) {
            const collection = results.find((r) => r.wrapperType === 'collection') || results[0];
            const name = collection.collectionName || 'Imported Apple Music Album';
            const rawCover = collection.artworkUrl100 || '';
            const coverUrl = rawCover ? rawCover.replace('100x100bb', '600x600bb') : '';
            const trackItems = results.filter((r) => r.wrapperType === 'track');
            const queries = trackItems.map((t) => ({
              title: t.trackName || '',
              artist: t.artistName || collection.artistName || ''
            }));

            if (queries.length > 0) {
              return {
                platform: 'Apple Music',
                name,
                coverUrl,
                queries
              };
            }
          }
        }
      } catch (err) {
        console.warn('Apple Music / iTunes lookup failed:', err);
      }
    }

    // Apple Music Playlist URL (e.g. https://music.apple.com/us/playlist/todays-hits/pl.f4d1060b52a243d7b321e1e8a70f8e37)
    const playlistMatch = targetUrl.match(/playlist\/(?:[^\/]+\/)?(pl\.[a-zA-Z0-9_-]+)/i);
    if (playlistMatch) {
      try {
        const pageRes = await fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        if (pageRes.ok) {
          const html = await pageRes.text();

          // Title & cover from meta
          const titleMatch =
            html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<title>([^<]+)<\/title>/i);
          const rawTitle = titleMatch ? titleMatch[1].replace(/\s*[-–—]\s*(Apple Music|Playlist).*$/i, '').trim() : 'Apple Music Playlist';

          const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          const coverUrl = imgMatch ? imgMatch[1] : '';

          const queries = [];

          // Format A: JSON-LD MusicPlaylist schema
          const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
          if (jsonLdMatches) {
            for (const scriptTag of jsonLdMatches) {
              try {
                const inner = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                const data = JSON.parse(inner);
                const tracks = data?.track || (Array.isArray(data) ? data : []);
                if (Array.isArray(tracks)) {
                  for (const tr of tracks) {
                    const songName = tr?.name;
                    const artistName =
                      tr?.byArtist?.name ||
                      (Array.isArray(tr?.byArtist) ? tr.byArtist.map((a) => a.name).join(', ') : '');
                    if (songName) {
                      queries.push({
                        title: songName,
                        artist: artistName || ''
                      });
                    }
                  }
                }
              } catch {}
            }
          }

          // Format B: Extract from tracklist table or data-testid attributes
          if (queries.length === 0) {
            const rowMatches = html.matchAll(/data-testid=["']track-title["'][^>]*>([^<]+)<\/a>[\s\S]*?data-testid=["']track-artist["'][^>]*>([^<]+)<\/a>/gi);
            for (const m of rowMatches) {
              if (m[1]) {
                queries.push({
                  title: m[1].trim(),
                  artist: (m[2] || '').trim()
                });
              }
            }
          }

          if (queries.length > 0) {
            return {
              platform: 'Apple Music',
              name: rawTitle,
              coverUrl,
              queries
            };
          }
        }
      } catch (plErr) {
        console.warn('Apple Music playlist scrape failed:', plErr);
      }
    }
  }

  return { error: 'Could not parse playlist link. Make sure the playlist or album is public.' };
}
