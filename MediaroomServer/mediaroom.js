// app.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 80;

// FS path до папката со видеа (постави ја според твојата структура)
const videoDirFs = path.join(__dirname, 'youtubeclone', 'videos_mediaroom');
// -------- AppImages (for MRML image(AppImages/...)) --------
const appImagesDir = path.join(__dirname, 'Applicationlauncher', 'AppImages');

if (!fs.existsSync(appImagesDir)) {
  console.log('Warning: AppImages folder does not exist:', appImagesDir);
}

// Serve Mediaroom images
app.use('/Applicationlauncher/AppImages', express.static(appImagesDir, {
  maxAge: '1d',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// Serve статички видео фајлови (важно: дозволува HTTP Range)
if (!fs.existsSync(videoDirFs)) {
  console.log('Warning: local video folder does not exist:', videoDirFs);
}
app.use('/youtubeclone/videos_mediaroom', express.static(videoDirFs));

// helper: escape XML special chars
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function replaceUnderscoreWithSpace(str) {
  return String(str).replace(/_/g, ' ');
}

function replaceSpaceWithUnderscore(str) {
  return String(str).replace(/ /g, '_');
}

// helper: get a usable fetch function (tries global, then node-fetch)
function getFetch() {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  try {
    const nf = require('node-fetch');
    return nf && (nf.default || nf);
  } catch (e) {
    return null;
  }
}

// ----------------- GRID BUILDER (filenames only, netflix-like) -----------------
const ITEMS_PER_ROW = 5;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 140;
const CARD_SPACING = 20;

function buildNetflixGridFiles(filesArray, startOffset, req) {
  let html = `
      <VerticalFlowPanel
        id="VideoGrid"
        top="110"
        left="40"
        width="1200"
        height="560"
        clipsChildren="true"
        itemSpacing="${CARD_SPACING}">
  `;

  for (let i = 0; i < filesArray.length; i += ITEMS_PER_ROW) {
    html += `<HorizontalFlowPanel height="${CARD_HEIGHT}" itemSpacing="${CARD_SPACING}">\n`;

    filesArray.slice(i, i + ITEMS_PER_ROW).forEach((fullUrl, idx) => {
      const globalIndex = startOffset + i + idx;
      let name = fullUrl.split('/').pop() || `video${globalIndex+1}`;
      try { name = decodeURIComponent(name); } catch (e) {}
      name = name.replace(/\.(mp4|m4v|mov)$/i, '');
      const safeName = escapeXml(replaceUnderscoreWithSpace(name));
      const playUrl = `${req.protocol}://${req.get('host')}/Applicationlauncher/PlayVideo.aspx?video_url=${encodeURIComponent(fullUrl)}&video_name=${encodeURIComponent(name)}`;

      html += `
          <Button
            id="video_${globalIndex}"
            width="${CARD_WIDTH}"
            height="${CARD_HEIGHT}"
            focusScale="1.08"
            backgroundFocus="argb(255,40,40,40)"
            justification="center"
            href="page:${escapeXml(playUrl)}">

            <Text
              top="10"
              width="${CARD_WIDTH}"
              height="${CARD_HEIGHT - 20}"
              fontstyle="Reg18"
              lines="3"
              alignment="center"
              ellipsize="end">
              ${safeName}
            </Text>

            <Actions>
              <Event
                type="onclick"
                action="navigate"
                url="page:${escapeXml(playUrl)}" />
            </Actions>
          </Button>
      `;
    });

    html += `</HorizontalFlowPanel>\n`;
  }

  html += `</VerticalFlowPanel>\n`;
  return html;
}
// ----------------- END GRID BUILDER -----------------

// ---------- ORIGINAL Launcher page (unchanged MRML you provided) ----------
app.get('/Applicationlauncher/ApplicationLauncherF.aspx', (req, res) => {
  res.set('Content-Type', 'application/vnd.microsoft-tvui+xml');
  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="1.1">
	<MrmlPage id="TVPage11" background="image(AppImages/pozadina.jpg)" height="720" width="1280">
    <Panel id="TVPanel1" top="100" left="100" height="500" width="100">
      <Button id="TVButtonTVMix" background="image(AppImages/youtube.png)" focusbackground="image(AppImages/youtube.png)" focusglow="image(AppImages/youtube.png)" fontstyle="Reg26" foreground="argb(255,0,0,0)" height="150" href="page:http://172.16.40.101/Applicationlauncher/LukaTube.aspx" left="250" top="50" width="150"></Button>
      <Text id="TVLabel1" foreground="argb(255,226,0,116)" fontstyle="Reg32" top="115" left="600">LukaTube@MaxTV</Text>
      <Text id="TVLabel2" fontstyle="Reg26" top="160" left="600" height="800" width="300">Гледај ги омилените видеа од LukaTube на вашиот ТВ приемник.</Text>
    </Panel>
  </MrmlPage>
</uidescription>`;
  res.send(mrml);
});
// ------------------------------------------------------------------


// ---------- DYNAMIC video list + player (remote + fallback local) with Load more ----------
app.get('/Applicationlauncher/LukaTube.aspx', async (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const remoteBase = 'http://172.16.40.100/youtubeclone/videos_mediaroom/';
  let files = []; // absolute URLs

  // Try remote listing if possible
  const fetchFn = getFetch();
  if (fetchFn) {
    try {
      const r = await fetchFn(remoteBase);
      if (r && r.ok) {
        const ct = r.headers && typeof r.headers.get === 'function' ? r.headers.get('content-type') : '';
        const text = await r.text();

        // If JSON array
        if (ct && ct.includes('application/json')) {
          try {
            const j = JSON.parse(text);
            if (Array.isArray(j)) {
              j.forEach(item => {
                if (typeof item === 'string' && item.toLowerCase().endsWith('.mp4')) {
                  files.push(new URL(item, remoteBase).href);
                } else if (item && typeof item === 'object') {
                  const candidate = item.url || item.path || item.file || item.name;
                  if (candidate && String(candidate).toLowerCase().endsWith('.mp4')) {
                    files.push(new URL(candidate, remoteBase).href);
                  }
                }
              });
            }
          } catch (e) {
            // ignore JSON parse errors and continue to HTML parsing
          }
        }

        // HTML parsing (Apache directory listing)
        if (files.length === 0) {
          const hrefRegex = /href\s*=\s*["']([^"']+\.mp4)["']/gi;
          let m; const found = new Set();
          while ((m = hrefRegex.exec(text)) !== null) {
            try {
              const abs = new URL(m[1], remoteBase).href;
              if (!found.has(abs)) { found.add(abs); files.push(abs); }
            } catch (e) {}
          }

          // fallback plain occurrences
          if (files.length === 0) {
            const fileRegex = /([^\s"'<>()]+\.mp4)/gi;
            while ((m = fileRegex.exec(text)) !== null) {
              try {
                const abs = new URL(m[1], remoteBase).href;
                if (!files.includes(abs)) files.push(abs);
              } catch (e) {}
            }
          }
        }
      } else {
        console.log('Remote fetch returned not ok:', r && r.status);
      }
    } catch (err) {
      console.log('Remote fetch failed:', err && (err.message || err));
    }
  } else {
    // no fetch available
  }

  // Local fallback
  if (files.length === 0) {
    if (fs.existsSync(videoDirFs)) {
      try {
        const localFiles = fs.readdirSync(videoDirFs)
          .filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ext === '.mp4' || ext === '.m4v' || ext === '.mov';
          })
          .sort();

        files = localFiles.map(f => `${req.protocol}://${req.get('host')}/youtubeclone/videos_mediaroom/${encodeURIComponent(f)}`);
      } catch (e) {
        console.error('Local fallback read failed:', e && (e.message || e));
      }
    } else {
      console.log('Local video folder not found:', videoDirFs);
    }
  }

  // --- SEARCH support (Mediaroom sends SearchLukaTube and often SearchButton=)
  const rawSearch = (req.query.SearchLukaTube || '').toString().trim();
  const searchLower = rawSearch.toLowerCase();

  if (searchLower) {
    files = files.filter(fullUrl => {
      let name = fullUrl.split('/').pop() || '';
      try { name = decodeURIComponent(name); } catch (e) {}
      name = name.replace(/\.(mp4|m4v|mov)$/i, '');
      const display = replaceUnderscoreWithSpace(name).toLowerCase();
      return display.includes(searchLower);
    });
  }

  // Pagination: offset & pageSize via query
  const pageSize = Math.max(1, Number(req.query.pageSize) || 12);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const total = files.length;
  const pageFiles = files.slice(offset, offset + pageSize);

  // defaultUrl not strictly required here, kept for compatibility
  const defaultUrl = pageFiles.length ? pageFiles[0] : (files.length ? files[0] : '');

  // Build MRML (Netflix-like grid, filenames only)
  let mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="LukaTubeList" appid="lukatube.app/1.0" width="1280" height="720">

    <!-- GLOBAL ACTIONS -->
    <Actions>
      <Action
        name="SearchLukaTube"
        type="submit"
        data="SearchLukaTube"
        url="page:${req.protocol}://${req.get('host')}/Applicationlauncher/LukaTube.aspx"
        method="GET" />
    </Actions>

    <Header />

    <Panel id="MainPanel" left="0" top="0" width="1280" height="720">

      <Text
        id="Title"
        top="10"
        left="20"
        width="900"
        height="30"
        fontstyle="Reg26"
        foreground="argb(255,228,0,115)">
        LukaTube - Videos ${ total ? `(showing ${offset+1}-${Math.min(offset+pageSize, total)} of ${total})` : '' }
      </Text>
      <!-- SEARCH INPUT -->
      <EditText
        id="SearchLukaTube"
        top="50"
        left="20"
        width="400"
        height="40"
        visible="true"
        hint="Search videos..."
        value="${escapeXml(rawSearch)}" />

      <!-- SEARCH BUTTON -->
      <Button
        id="SearchButton"
        top="50"
        left="430"
        width="140"
        height="40"
        justification="center">
        <Text>Search LukaTube</Text>
        <Actions>
          <Event type="onclick" action="SearchLukaTube"/>
        </Actions>
      </Button>
`;

  // Insert Netflix-like grid (filenames only)
  mrml += buildNetflixGridFiles(pageFiles, offset, req);

  // Load more (if any)
  const nextOffset = offset + pageSize;
  if (nextOffset < total) {
    const nextUrl = `${req.protocol}://${req.get('host')}/Applicationlauncher/LukaTube.aspx?offset=${nextOffset}&pageSize=${pageSize}${rawSearch ? `&SearchLukaTube=${encodeURIComponent(rawSearch)}` : ''}`;
    mrml += `
      <Panel id="loadmorePanel" width="1200" height="80" top="690" left="40">
        <Button id="loadMoreBtn" top="10" left="0" width="600" height="40" fontstyle="Reg26" 
          href="page:${escapeXml(nextUrl)}">
          <Text top="0" left="8" width="584" height="40">Load more videos...</Text>
        </Button>
      </Panel>
    `;
  }

  // Close MRML
  mrml += `
    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);
});
// ------------------------------------------------------------------


// ---------- PlayVideo.aspx (renders only the player for given video_url) ----------
app.get('/Applicationlauncher/PlayVideo.aspx', (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  let videoUrl = req.query.video_url || '';
  let videoname = req.query.video_name || '';
  try {
    videoUrl = decodeURIComponent(videoUrl);
    videoUrl = videoUrl.replace(/ /g, '%20');
  } catch (e) {
    // leave as-is or empty
  }

  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="PlayVideoPage" appid="lukatube.app/1.0" width="1280" height="720">
    <Header />
    <Panel>
      <Video id="video" visible="true" showbusyindicator="true" width="1280" timeshiftenabled="true" timeshiftbuffersize="3600" allowtrickmodes="true" height="720" ${ videoUrl ? `tuneurl="${escapeXml(videoUrl)}"` : '' } />
      <Text id="Main_WelcomeText" highlightcolor="argb(255,228,0,115)" margin="rect(30,20,0,0)" width="500" height="80"> Current Time: {Time} Current Date: {Date} \n ${replaceUnderscoreWithSpace(escapeXml(videoname))}</Text>
    </Panel>
  </MrmlPage>
</uidescription>`;
  res.send(mrml);
});
// ------------------------------------------------------------------


app.get('/24ti/default.aspx', (req, res) => {
  res.set('Content-Type', 'application/vnd.microsoft-tvui+xml');

  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
	<MrmlPage id="tvPage" background="image(Images/BackgroundWide.jpg)" width="853" inanimations="PageInForward">
    <Panel id="ContainerPanel" left="106" height="480" width="640">
      <VerticalFlowPanel id="Main_Panel" top="70" left="20">
        <Text id="Main_WelcomeText" highlightcolor="argb(255,228,0,115)" margin="rect(30,10,0,0)" height="120" width="500">
				Lukify@MaxTV
                Welcome to Mediaroom!
				</Text>
        <HorizontalFlowPanel id="Main_BillsMenu_MenuPanel" margin="rect(0,20,0,0)">
          <DataSource id="Main_BillsMenu_SystemDataSource" uri="local://system-info" />
          <EditText id="DeviceGuid" visible="false" datasource="{Binding Source=Main_BillsMenu_SystemDataSource,Path=DeviceId}"></EditText>
          <Button id="Main_BillsMenu_TelephoneButton" justification="center" margin="rect(10,0,0,0)" width="140" href="page:http://172.16.40.101/Applicationlauncher/LukaTube.aspx">
						Open LukaTube
            </Button>
            <Actions><Event type="onclick" action="NavigateTelephone" /></Actions>
          <Actions>
            <Action name="NavigateTelephone" type="submit" data="DeviceGuid" url="page:http://172.16.40.101/Applicationlauncher/LukaTube.aspx" method="GET" />
            
            <Action name="Exit1" type="navigate" data="action:exittotv" />
          </Actions>
        </HorizontalFlowPanel>
      </VerticalFlowPanel>
    </Panel>
	</MrmlPage>
</uidescription>`;

  res.send(mrml);
});
// ------------------------------------------------------------------

// ---------- Profile page: PFTvBills/default.aspx ----------
app.get('/PFTvBills/default1.aspx', (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const username = req.query.username || 'Guest';
  const accountNumber = req.query.account || '123456789';
  const balance = req.query.balance || '$100.00';
  const lastPayment = req.query.lastPayment || '2026-01-10';

  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="ProfilePage" appid="pfprofile.app/1.0" width="1280" height="720">
    <Header />
    <Panel id="ProfilePanel" top="0" left="0" width="1280" height="720">

      <!-- Title -->
      <Text id="ProfileTitle" top="10" left="20" width="600" height="40" fontstyle="Reg32" foreground="argb(255,228,0,115)">
        User Profile
      </Text>

      <!-- User Info -->
      <Panel id="UserInfoPanel" top="70" left="20" width="500" height="200">
        <Text id="Username" top="0" left="0" width="500" height="40" fontstyle="Reg28">
          Username: ${escapeXml(username)}
        </Text>
        <Text id="AccountNumber" top="50" left="0" width="500" height="40" fontstyle="Reg28">
          Account Number: ${escapeXml(accountNumber)}
        </Text>
        <Text id="Balance" top="100" left="0" width="500" height="40" fontstyle="Reg28">
          Balance: ${escapeXml(balance)}
        </Text>
        <Text id="LastPayment" top="150" left="0" width="500" height="40" fontstyle="Reg28">
          Last Payment: ${escapeXml(lastPayment)}
        </Text>
      </Panel>

      <!-- Actions -->
      <Button id="PayBillBtn" top="300" left="20" width="200" height="50" justification="center">
        <Text top="0" left="0" width="200" height="50">Pay Bill</Text>
        <Actions>
          <Event type="onclick" action="PayBill"/>
        </Actions>
      </Button>

      <Actions>
        <Action name="PayBill" type="submit" data="account=${escapeXml(accountNumber)}" url="page:http://172.16.40.101/PFTvBills/Pay.aspx" method="GET" />
      </Actions>

    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);
});

// ---------- MRML page showing only request headers ----------
app.get('/IPTVRequestHeaders/RequestHeaders.aspx', (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // Start MRML
  let mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="HeadersOnlyPage" appid="pfheaders.app/1.0" width="1280" height="720">
    <Panel id="HeadersPanel" top="0" left="0" width="1280" height="720" clipsChildren="true">
      <Text id="HeadersTitle" top="10" left="20" width="1240" height="40" fontstyle="Reg32" foreground="argb(255,228,0,115)">
        Request Headers
      </Text>
`;

  // Display each header
  let topPos = 60;
  for (const [key, value] of Object.entries(req.headers)) {
    mrml += `
      <Text top="${topPos}" left="20" width="1240" height="24" fontstyle="Reg22">
        ${escapeXml(key)}: ${escapeXml(value)}
      </Text>
    `;
    topPos += 26;
  }

  // Close MRML
  mrml += `
    </Panel>
  </MrmlPage>
</uidescription>
`;

  res.send(mrml);
});

// ---------- Profile Page with Playlists + cover art ----------
const fetch = getFetch(); // your fetch helper

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fixBio(bio, maxLength = 150) {
  if (!bio) return '';
  let text = String(bio).replace(/\r\n|\r|\n/g, ' ');
  text = text.replace(/&amp;amp;/g, '&').replace(/&amp;#039;/g, "'").replace(/&amp;/g, '&');
  if (text.length > maxLength) text = text.slice(0, maxLength) + '...';
  return escapeXml(text);
}

app.get('/PFTvBills/default.aspx', async (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const phone = (req.query.phone || '070844299').toString();
  const tab = (req.query.tab || 'profile').toString().toLowerCase();

  // default user
  let user = {
    username: 'unknown',
    full_name: 'Unknown User',
    profile_picture_url: '',
    bio: '',
    gym_name: '',
    instagram: '',
    github: '',
    gym_location: '',
    date_of_birth: '',
    gender: '',
    weight_kg: '',
    height_cm: '',
    phone_number: '',
    playlists: []
  };

  // fetch user
  try {
    const apiUrl = `http://172.16.40.100/getUserByPhoneNumber.php?phone=${encodeURIComponent(phone)}`;
    const response = await fetch(apiUrl);
    if (response && response.ok) {
      const data = await response.json();
      if (data && data.success && data.user) user = { ...user, ...data.user };
    } else {
      console.log('API fetch failed with status', response && response.status);
    }
  } catch (err) {
    console.log('API fetch error:', err && (err.message || err));
  }

  // Build playlists MRML with cover art
  let playlistsMRML = '';
  if (Array.isArray(user.playlists) && user.playlists.length > 0) {
    playlistsMRML += `<VerticalFlowPanel id="PlaylistsTab" visible="${tab === 'playlists' ? 'true' : 'false'}" top="120" left="20" width="1240" height="560" clipsChildren="true">\n`;

    user.playlists.forEach((pl, plIndex) => {
      const safePlName = escapeXml(pl.name || `Playlist ${plIndex+1}`);
      playlistsMRML += `<Text top="0" left="0" width="1200" height="30" fontstyle="Reg24" foreground="argb(255,228,0,115)">Playlist: ${safePlName}</Text>\n`;

      if (Array.isArray(pl.songs) && pl.songs.length > 0) {
        pl.songs.forEach((song, sIndex) => {
          const title = escapeXml(song.title || song.song_id || `song${sIndex+1}`);
          const artist = escapeXml(song.artist || '');
          const songUrl = song.url ? String(song.url) : '';
          const coverUrl = song.cover_url ? String(song.cover_url) : (Array.isArray(pl.cover_url) && pl.cover_url[0] ? String(pl.cover_url[0]) : '');
          const safeSongUrl = songUrl ? escapeXml(songUrl) : '';
          const safeCoverUrl = coverUrl ? escapeXml(coverUrl) : '';

          // unique element id
          const elementId = `pl${plIndex}_s${sIndex}`;

// Replace lukaserver with local IP and encode spaces
const fullUrl = safeSongUrl
  .replace('http://lukaserver.ddns.net/', 'http://172.16.40.100/')
  .replace(/ /g, '%20'); // encode spaces as %20

const name = title; // or song.title

// Build PlayVideo.aspx URL
const playUrl = `${req.protocol}://${req.get('host')}/Applicationlauncher/PlayVideo.aspx?video_url=${encodeURIComponent(fullUrl)}&video_name=${encodeURIComponent(name)}`;

playlistsMRML += `
  <HorizontalFlowPanel top="0" left="0" width="1200" height="80" itemSpacing="12" margin="rect(6,4,6,4)">
    ${safeCoverUrl ? `<Image id="${elementId}_img" width="64" height="64" src="${safeCoverUrl}" />` : `<Panel width="64" height="64" />`}
    <VerticalFlowPanel width="900" height="64">
      <Text width="900" height="36" fontstyle="Reg20">${title}</Text>
      <Text width="900" height="20" fontstyle="Reg18" foreground="argb(255,180,180,180)">${artist}</Text>
    </VerticalFlowPanel>
    ${safeSongUrl ? `<Button width="150" height="36" justification="center" href="page:${escapeXml(playUrl)}"><Text>Play</Text></Button>` : `<Panel width="150" height="36" />`}
  </HorizontalFlowPanel>\n`;


        });
      } else {
        playlistsMRML += `<Text top="0" left="20" width="1180" height="24" fontstyle="Reg20">No songs</Text>\n`;
      }

      playlistsMRML += `<Panel height="8" />\n`;
    });

    playlistsMRML += `</VerticalFlowPanel>\n`;
  } else {
    playlistsMRML += `<VerticalFlowPanel id="PlaylistsTab" visible="${tab === 'playlists' ? 'true' : 'false'}" top="120" left="20" width="1240" height="560"><Text top="0" left="0" width="1200" height="30" fontstyle="Reg22">No playlists found</Text></VerticalFlowPanel>\n`;
  }

  const baseUrl = `${req.protocol}://${req.get('host')}/PFTvBills/default.aspx`;
  const profileTabHref = `${baseUrl}?phone=${encodeURIComponent(phone)}&tab=profile`;
  const playlistsTabHref = `${baseUrl}?phone=${encodeURIComponent(phone)}&tab=playlists`;

  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="ProfilePage" width="1280" height="720">
    <Panel id="ContainerPanel" left="0" top="0" width="1280" height="720">

      <!-- Phone search -->
      <EditText 
          id="PhoneSearch" 
          top="10" 
          left="20" 
          width="300" 
          height="40" 
          visible="true" 
          hint="Enter phone number..." 
          value="${escapeXml(phone)}" 
          name="phone"
      />
      <Button id="SearchButton" top="10" left="330" width="120" height="40" justification="center">
          <Text>Search</Text>
          <Actions>
              <!-- This tells MRML to submit the form using the value from the EditText named 'phone' -->
              <Event type="onclick" action="SearchPhone"/>
          </Actions>
      </Button>

      <Actions>
          <Action 
              name="SearchPhone" 
              type="submit" 
              data="phone" 
              url="page:${escapeXml(baseUrl)}" 
              method="GET" 
          />
      </Actions>

      <!-- Tabs -->
      <HorizontalFlowPanel id="TabButtons" top="60" left="20" width="1240" height="44" itemSpacing="10">
        <Button id="ProfileTabButton" width="200" height="44" href="page:${escapeXml(profileTabHref)}"><Text>Profile Info</Text></Button>
        <Button id="PlaylistsTabButton" width="200" height="44" href="page:${escapeXml(playlistsTabHref)}"><Text>Playlists</Text></Button>
      </HorizontalFlowPanel>

      <!-- Profile tab -->
      <Panel id="ProfileTab" visible="${tab === 'profile' ? 'true' : 'false'}" top="120" left="20" width="1240" height="560">
        ${user.profile_picture_url ? `<Image id="ProfilePic" top="0" left="0" width="180" height="180" src="${escapeXml(user.profile_picture_url)}" />` : ''}
        <VerticalFlowPanel id="UserInfoPanel" top="0" left="200" width="1000" height="560">
          <Text id="FullName" top="0" left="0" width="1000" height="40" fontstyle="Reg28" foreground="argb(255,228,0,115)">${escapeXml(user.full_name)}</Text>
          <Text id="Username" top="40" left="0" width="1000" height="28" fontstyle="Reg24">Username: ${escapeXml(user.username)}</Text>
          <Text id="Bio" top="80" left="0" width="1000" height="72" fontstyle="Reg22">Bio: ${fixBio(user.bio,150)}</Text>
          <Text id="Gym" top="160" left="0" width="1000" height="28" fontstyle="Reg22">Gym: ${escapeXml(user.gym_name)} (${escapeXml(user.gym_location)})</Text>
          <Text id="Instagram" top="200" left="0" width="1000" height="28" fontstyle="Reg22">Instagram: ${escapeXml(user.instagram)}</Text>
          <Text id="Github" top="240" left="0" width="1000" height="28" fontstyle="Reg22">GitHub: ${escapeXml(user.github)}</Text>
          <Text id="DOB" top="280" left="0" width="1000" height="28" fontstyle="Reg22">DOB: ${escapeXml(user.date_of_birth)} (Age: ${escapeXml(user.age || '')})</Text>
          <Text id="Gender" top="320" left="0" width="1000" height="28" fontstyle="Reg22">Gender: ${escapeXml(user.gender)}</Text>
          <Text id="Height" top="360" left="0" width="1000" height="28" fontstyle="Reg22">Height: ${escapeXml(user.height_cm)} cm</Text>
          <Text id="Weight" top="400" left="0" width="1000" height="28" fontstyle="Reg22">Weight: ${escapeXml(user.weight_kg)} kg</Text>
          <Text id="Phone" top="440" left="0" width="1000" height="28" fontstyle="Reg22">Phone: ${escapeXml(user.phone_number)}</Text>
        </VerticalFlowPanel>
      </Panel>

      <!-- Playlists Tab content -->
      ${playlistsMRML}

    </Panel>
  </MrmlPage>
</uidescription>

`;

  res.send(mrml);
});


app.listen(port, () => {
  console.log(`Mediaroom MaxTV Application server running on http://172.16.40.101:${port}`);
  const ff = getFetch();
  console.log('fetch available:', !!ff);
  console.log('local video folder:', videoDirFs, 'exists=', fs.existsSync(videoDirFs));
});
