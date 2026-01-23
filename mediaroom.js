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
<uidescription version="3.0">

  <MrmlPage
    id="TVPage11"
    width="1280"
    height="720"
    background="image(AppImages/pozadina.jpg)">

    <Panel
      id="TVPanel1"
      left="0"
      top="0"
      width="1280"
      height="720">

      <!-- LukaTube Button (UNCHANGED POSITION) -->
      <Button
        id="TVButtonTVMix"
        left="250"
        top="250"
        width="150"
        height="150"
        background="image(AppImages/youtube.png)"
        focusbackground="image(AppImages/youtube.png)"
        href="page:http://172.16.40.101/Applicationlauncher/LukaTube.aspx"/>

      <!-- App Store Button (SAME ROW, SAME SIZE) -->
      <Button
        id="TVButtonAppStore"
        left="430"
        top="250"
        width="150"
        height="150"
        background="image(AppImages/appstore.png)"
        focusbackground="image(AppImages/appstore.png)"
        href="page:http://172.16.40.100/stbappstore/appstore.php"/>

      <!-- Title (UNCHANGED) -->
      <Text
        id="TVLabel1"
        left="600"
        top="115"
        fontstyle="Reg32"
        foreground="argb(255,226,0,116)">
        LukaTube@MaxTV
      </Text>

      <!-- Description (UNCHANGED) -->
      <Text
        id="TVLabel2"
        left="600"
        top="160"
        width="420"
        fontstyle="Reg26"
        foreground="argb(255,255,255,255)">
        Гледај ги омилените видеа од LukaTube на вашиот ТВ приемник.
      </Text>

    </Panel>

  </MrmlPage>
</uidescription>
`;
  res.send(mrml);
});
// ------------------------------------------------------------------


app.get('/Applicationlauncher/LukaTube.aspx', async (req, res) => {
console.log("App started/loaded more")
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
        LukaTube - Videos ${ total ? `(showing ${offset+1}-${Math.min(offset+pageSize, total)} of ${total}) \n {Time}` : '' }
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


app.get('/Applicationlauncher/YouTube.aspx', async (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const offset = Math.max(0, Number(req.query.offset) || 0);
  const pageSize = Math.max(1, Number(req.query.pageSize) || 12);
  const rawSearch = (req.query.SearchYouTube || '').toString().trim();
  const searchLower = rawSearch.toLowerCase();

  // --- Fetch YouTube videos via RapidAPI ---
  let videos = [];
  try {
    const response = await axios.get(
      'https://youtube-media-downloader.p.rapidapi.com/v2/search/videos',
      {
        params: {
          keyword: rawSearch || 'Rick Astley',
          uploadDate: 'all',
          duration: 'all',
          sortBy: 'relevance'
        },
        headers: {
          'X-RapidAPI-Host': 'youtube-media-downloader.p.rapidapi.com',
          'X-RapidAPI-Key': 'b8d236e82cmsh17bfa10c34b5c71p104388jsn239a1ead0660'
        },
        timeout: 10000
      }
    );

    const items = response.data?.items || [];
    videos = items.map(v => ({
      id: v.id || v.videoId || '',
      title: v.title || 'Untitled'
    }));

  } catch (err) {
    console.log('RapidAPI request failed:', err.message);
  }

  // Local filter
  if (searchLower) videos = videos.filter(v => v.title.toLowerCase().includes(searchLower));

  const total = videos.length;
  const pageVideos = videos.slice(offset, offset + pageSize);

  // --- Search results text ---
  let searchResultsText = '';
  if (rawSearch) {
    const escapedQuery = escapeXml(rawSearch);
    searchResultsText = `
      <Text
        id="SearchResultsInfo"
        top="100"
        left="20"
        width="700"
        height="30"
        fontstyle="Reg20"
        foreground="argb(255,200,200,200)">
        ${total} search result${total !== 1 ? 's' : ''} found for "${escapedQuery}"
      </Text>
    `;
  }

  // --- MRML generation (LukaTube list style) ---
  let mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="YouTubeList" appid="lukatube.app/1.0" width="1280" height="720">

    <Actions>
      <Action
        name="SearchYouTube"
        type="submit"
        data="SearchYouTube"
        url="page:${req.protocol}://${req.get('host')}/Applicationlauncher/YouTube.aspx"
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
        YouTube - Videos ${ total ? `(showing ${offset+1}-${Math.min(offset+pageSize, total)} of ${total})` : '' }
      </Text>

      <EditText
        id="SearchYouTube"
        top="50"
        left="20"
        width="400"
        height="40"
        visible="true"
        hint="Search videos..."
        value="${escapeXml(rawSearch)}" />

      <Button
        id="SearchButton"
        top="50"
        left="430"
        width="140"
        height="40"
        justification="center">
        <Text>Search YouTube</Text>
        <Actions>
          <Event type="onclick" action="SearchYouTube"/>
        </Actions>
      </Button>

      ${searchResultsText}
      
      <Panel id="VideoList" top="${rawSearch ? 140 : 100}" left="20" width="1240" height="580">
`;

  // --- Add video title buttons only ---
  pageVideos.forEach((v, i) => {
    const top = 10 + i * 50;
    mrml += `
        <Button id="videoBtn${i}" top="${top}" left="0" width="1240" height="40"
                href="page:${req.protocol}://${req.get('host')}/Applicationlauncher/PlayYouTubeVideo.aspx?videoId=${encodeURIComponent(v.id)}">
          <Text top="0" left="10" width="1220" height="40" fontstyle="Reg22" foreground="argb(255,255,255,255)">
            ${escapeXml(v.title)}
          </Text>
        </Button>
    `;
  });

  // --- Load more button ---
  const nextOffset = offset + pageSize;
  if (nextOffset < total) {
    const nextUrl = `${req.protocol}://${req.get('host')}/Applicationlauncher/YouTube.aspx?offset=${nextOffset}&pageSize=${pageSize}${rawSearch ? `&SearchYouTube=${encodeURIComponent(rawSearch)}` : ''}`;
    mrml += `
      <Panel id="loadmorePanel" width="1200" height="80" top="${10 + pageVideos.length * 50}" left="40">
        <Button id="loadMoreBtn" top="10" left="0" width="600" height="40" fontstyle="Reg26" 
          href="page:${escapeXml(nextUrl)}">
          <Text top="0" left="8" width="584" height="40">Load more videos...</Text>
        </Button>
      </Panel>
    `;
  }

  mrml += `
      </Panel>
    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);
});



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
          <EditText id="DeviceGuid" visible="true" datasource="{Binding Source=Main_BillsMenu_SystemDataSource,Path=DeviceId}"></EditText>
          <Button id="OpenLukaTube" justification="center" margin="rect(10,0,0,0)" width="140" href="page:http://172.16.40.101/Applicationlauncher/LukaTube.aspx">
                        Open LukaTube
            </Button>
            <Button id="ViewRequestHeaders" justification="center" margin="rect(10,0,0,0)" width="140" href="page:http://172.16.40.101/IPTVRequestHeaders/RequestHeaders.aspx">
                        View request headers
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


// ---------- PlayVideo.aspx (renders only the player for given video_url) ----------
app.get('/Applicationlauncher/PlayVideo.aspx', async (req, res) => {

  // ---------- LOG VIDEO INFO ----------
  console.log(
    "Video started playing on IPTV STB",
    req.get("user-agent"),
    "Video Name:",
    replaceUnderscoreWithSpace(req.query.video_name || '')
  );

  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const remoteBase = 'http://172.16.40.100/youtubeclone/videos_mediaroom/';
  const videoDirFs = path.join(__dirname, 'youtubeclone', 'videos_mediaroom');
  let files = [];

  // ---------- REMOTE ----------
  const fetchFn = getFetch();
  if (fetchFn) {
    try {
      const r = await fetchFn(remoteBase);
      if (r && r.ok) {
        const text = await r.text();
        const re = /href\s*=\s*["']([^"']+\.(mp4|m4v|mov))["']/gi;
        let m;
        while ((m = re.exec(text)) !== null) {
          const abs = new URL(m[1], remoteBase).href;
          if (!files.includes(abs)) files.push(abs);
        }
      }
    } catch {}
  }

  // ---------- LOCAL FALLBACK ----------
  if (files.length === 0 && fs.existsSync(videoDirFs)) {
    const localFiles = fs.readdirSync(videoDirFs)
      .filter(f => /\.(mp4|m4v|mov)$/i.test(f))
      .sort();

    files = localFiles.map(f =>
      `${req.protocol}://${req.get('host')}/youtubeclone/videos_mediaroom/${encodeURIComponent(f)}`
    );
  }

  // ---------- CURRENT VIDEO ----------
  let videoUrl = req.query.video_url || '';
  let videoName = req.query.video_name || '';
  try {
    videoUrl = decodeURIComponent(videoUrl).replace(/ /g, '%20');
  } catch {}

  const idx = files.indexOf(videoUrl);

  // ---------- PREV / NEXT ----------
  const prevVideo = files.length > 1 ? files[(idx - 1 + files.length) % files.length] : '';
  const nextVideo = files.length > 1 ? files[(idx + 1) % files.length] : '';

  const prevName = prevVideo
    ? decodeURIComponent(prevVideo.split('/').pop()).replace(/\.(mp4|m4v|mov)$/i, '')
    : '';

  const nextName = nextVideo
    ? decodeURIComponent(nextVideo.split('/').pop()).replace(/\.(mp4|m4v|mov)$/i, '')
    : '';

  const prevUrl = prevVideo
    ? `${req.protocol}://${req.get('host')}/Applicationlauncher/PlayVideo.aspx?video_url=${encodeURIComponent(prevVideo)}&video_name=${encodeURIComponent(prevName)}`
    : '';

  const nextUrl = nextVideo
    ? `${req.protocol}://${req.get('host')}/Applicationlauncher/PlayVideo.aspx?video_url=${encodeURIComponent(nextVideo)}&video_name=${encodeURIComponent(nextName)}`
    : '';

  // ---------- MRML ----------
  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="PlayVideoPage" appid="lukatube.app/1.0" width="1280" height="720">

    <Header />

    <!-- Actions -->
    <Actions>
    ${nextUrl ? `<Event type="onkey:channelup" action="scriptChannel3Up"/>` : ''}
  ${prevUrl ? `<Event type="onkey:channeldown" action="scriptChannel1Down"/>` : ''}
      <!-- CHANNEL UP / DOWN -->
      ${nextUrl ? `<Action name="scriptChannel3Up" type="script" function="channelUpPlay" data="${escapeXml(nextUrl)}"/>` : ''}
      ${prevUrl ? `<Action name="scriptChannel1Down" type="script" function="channelDownPlay" data="${escapeXml(prevUrl)}"/>` : ''}

      <!-- Video end auto-play -->
      ${nextUrl ? `<Action name="autoPlayNext" type="script" function="playNextVideo" data="${escapeXml(nextUrl)}"/>` : ''}

      <!-- Exit app -->
      <Action name="scriptExit" type="script" function="handleAppLeave"/>

    </Actions>

     <Scripts>
    <Script>
    <![CDATA[
      function setVideo(url) {
        if (!url) return;

        // Stop current playback
        video.SetProperty("tuneurl", "");

        // Tune to new LukaTube video
        video.SetProperty("tuneurl", url);
      }

      function channelUpPlay(nextUrl) {
        setVideo(nextUrl);
      }

      function channelDownPlay(prevUrl) {
        setVideo(prevUrl);
      }

      function playNextVideo(nextUrl) {
        setVideo(nextUrl);
      }

      function handleAppLeave() {
        Application.Exit();
      }
    ]]>
  </Script>
  </Scripts>


    <Panel>

      <!-- VIDEO -->
      <Video
        id="video"
        width="1280"
        height="720"
        visible="true"
        showbusyindicator="true"
        allowtrickmodes="true"
        timeshiftenabled="true"
        timeshiftbuffersize="3600"
        tuneurl="${escapeXml(videoUrl)}">
      </Video>

      <!-- INFO TEXT -->
      <Text
        id="Main_WelcomeText"
        highlightcolor="argb(255,228,0,115)"
        margin="rect(30,20,0,0)"
        width="500"
        height="80">
        Current Time: {Time} Current Date: {Date}
        Device info: ${req.get("user-agent")}
        Video Name: ${replaceUnderscoreWithSpace(escapeXml(videoName))}
      </Text>

      <!-- PREV BUTTON (LEFT HALF CENTERED) -->
      ${prevUrl ? `<Button
        id="PrevButton"
        top="640"
        left="160"
        width="300"
        height="60"
        focusable="true"
        href="page:${escapeXml(prevUrl)}"
        background="argb(0,0,0,0)">
        <Text alignment="center" justification="center" fontstyle="Reg20" foreground="argb(255,255,255,255)">
          PREV: ${replaceUnderscoreWithSpace(escapeXml(prevName))}
        </Text>
      </Button>` : ''}

      <!-- NEXT BUTTON (RIGHT HALF CENTERED) -->
      ${nextUrl ? `<Button
        id="NextButton"
        top="640"
        left="880"
        width="300"
        height="60"
        focusable="true"
        href="page:${escapeXml(nextUrl)}"
        background="argb(0,0,0,0)">
        <Text alignment="center" justification="center" fontstyle="Reg20" foreground="argb(255,255,255,255)">
          NEXT: ${replaceUnderscoreWithSpace(escapeXml(nextName))}
        </Text>
      </Button>` : ''}

    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);
});



// ---------- Mini Web Browser with CSS positions & clickable labels as buttons
//              (UL/OL rendered horizontally; preserves same page layout)
app.get('/Applicationlauncher/WebBrowser.aspx', async (req, res) => {
  const axios = require('axios');
  const cheerio = require('cheerio');
  const os = require('os');
  const http = require('http');
  const https = require('https');

  const escapeXmlLocal = (typeof escapeXml === 'function') ? escapeXml : (s => {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  });

  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // --- URL handling ---
  let url = (req.query.BrowserUrl || req.query.url || '').toString().trim();
  if (!url) url = 'https://mail.baucentar.com.mk/';
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

  // --- get local IP ---
  let localIp = '';
  const nets = os.networkInterfaces();
  for (const n of Object.keys(nets)) {
    const lname = n.toLowerCase();
    if (lname.includes('ethernet 4') || lname.includes('eth4') || lname.includes('ethernet4')) {
      for (const net of nets[n]) {
        if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
      }
    }
    if (localIp) break;
  }
  if (!localIp) {
    for (const n of Object.keys(nets)) {
      for (const net of nets[n]) {
        if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
      }
      if (localIp) break;
    }
  }
  if (!localIp) localIp = '0.0.0.0';

  // --- fetch HTML ---
  let pageHtml = '';
  try {
    const agent = url.startsWith('https://')
      ? new https.Agent({ localAddress: localIp, rejectUnauthorized: false })
      : new http.Agent({ localAddress: localIp });

    const r = await axios.get(url, { httpAgent: agent, httpsAgent: agent, timeout: 15000, maxRedirects: 5 });
    pageHtml = r && r.data ? String(r.data) : '';
  } catch (err) {
    pageHtml = `<html><head><title>Load error</title></head><body><h1>Fetch failed</h1><p>${escapeXmlLocal(err && (err.message || String(err)))}</p></body></html>`;
  }

  const $ = cheerio.load(pageHtml, { decodeEntities: false });
  const ROOT = $('body').first().length ? $('body').first() : $.root();

  // --- helpers ---
  function resolveUrl(href) {
    if (!href) return '';
    try { return new URL(href, url).href; }
    catch (e) { return href; }
  }

  function parseStylePosition(style) {
    const pos = { top: 0, left: 0, width: 0, height: 0 };
    if (!style) return pos;
    // allow style to be object or string
    const s = (typeof style === 'string') ? style : '';
    const topMatch = s.match(/top\s*:\s*([\d.]+)px/i);
    const leftMatch = s.match(/left\s*:\s*([\d.]+)px/i);
    const widthMatch = s.match(/width\s*:\s*([\d.]+)px/i);
    const heightMatch = s.match(/height\s*:\s*([\d.]+)px/i);
    if (topMatch) pos.top = parseFloat(topMatch[1]);
    if (leftMatch) pos.left = parseFloat(leftMatch[1]);
    if (widthMatch) pos.width = parseFloat(widthMatch[1]);
    if (heightMatch) pos.height = parseFloat(heightMatch[1]);
    return pos;
  }

  function isInlineNode(node) {
    const tag = (node.name || '').toLowerCase();
    if (!tag) return false;
    const inlineTags = new Set(['a','img','span','b','strong','i','em','small','sub','sup']);
    return inlineTags.has(tag);
  }

  // --- collect blocks ---
  const blocks = [];

  function collect(node) {
    if (!node) return;
    if (node.type === 'text') {
      const t = $(node).text().trim();
      if (t) blocks.push({ type: 'paragraph', text: t, style: $(node).parent().attr('style') || '' });
      return;
    }
    const tag = (node.name || '').toLowerCase();

    // Block elements
    if (['p','div','section','article','header','main','footer'].includes(tag)) {
      const children = $(node).contents().toArray();
      const total = children.length;
      let inlineCount = 0;
      let nonEmptyTextCount = 0;
      for (const ch of children) {
        if (ch.type === 'text') {
          if ($(ch).text().trim()) nonEmptyTextCount++;
        } else if (isInlineNode(ch)) inlineCount++;
      }
      const style = $(node).attr('style') || '';

      if (inlineCount >= 2 || (inlineCount > 0 && nonEmptyTextCount > 0 && total <= 6)) {
        // horizontal group
        const items = [];
        for (const ch of children) {
          if (ch.type === 'text') {
            const t = $(ch).text().trim();
            if (t) items.push({ kind: 'text', text: t, style: $(ch).parent().attr('style') || '' });
          } else {
            const cname = (ch.name || '').toLowerCase();
            if (cname === 'img') items.push({ kind: 'img', src: resolveUrl($(ch).attr('src') || ''), alt: $(ch).attr('alt') || '', style: $(ch).attr('style') || '' });
            else if (cname === 'a') {
              const href = resolveUrl($(ch).attr('href') || '');
              const txt = $(ch).text().trim() || href;
              items.push({ kind: 'link', href, text: txt, style: $(ch).attr('style') || '' });
            } else {
              const txt = $(ch).text().trim();
              if (txt) items.push({ kind: 'text', text: txt, style: $(ch).attr('style') || '' });
            }
          }
        }
        blocks.push({ type: 'hgroup', items, style });
      } else {
        const text = $(node).text().trim();
        if (text) blocks.push({ type: 'paragraph', text, style });
        $(node).find('img').each((i, im) => blocks.push({ type: 'image', src: resolveUrl($(im).attr('src') || ''), alt: $(im).attr('alt') || '', style: $(im).attr('style') || '' }));
        $(node).find('a').each((i, a) => {
          const href = resolveUrl($(a).attr('href') || '');
          const txt = $(a).text().trim() || href;
          blocks.push({ type: 'link', text: txt, href: `${req.protocol}://${req.get('host')}/Applicationlauncher/WebBrowser.aspx?url=${href}`, style: $(a).attr('style') || '' });
        });
      }
      return;
    }

    // Headings
    if (['h1','h2','h3'].includes(tag)) {
      const txt = $(node).text().trim();
      if (txt) blocks.push({ type: 'heading', level: tag, text: txt, style: $(node).attr('style') || '' });
      return;
    }

    // Lists -> render horizontally (one hgroup representing the list)
    if (tag === 'ul' || tag === 'ol') {
      const listStyle = $(node).attr('style') || '';
      const items = [];
      $(node).children('li').each((i, li) => {
        const $li = $(li);
        // inside each li, look for a, img or text - keep a single item per li (if more, concatenate)
        const link = $li.find('a').first();
        if (link.length) {
          const href = resolveUrl(link.attr('href') || '');
          const txt = link.text().trim() || href;
          items.push({ kind: 'link', href, text: txt, style: $li.attr('style') || link.attr('style') || '' });
          return;
        }
        const img = $li.find('img').first();
        if (img.length) {
          items.push({ kind: 'img', src: resolveUrl(img.attr('src') || ''), alt: img.attr('alt') || '', style: $li.attr('style') || img.attr('style') || '' });
          return;
        }
        // fallback: plain text inside li (trim and collapse whitespace)
        const t = $li.text().trim();
        if (t) items.push({ kind: 'text', text: t, style: $li.attr('style') || '' });
      });
      // push as horizontal group but mark as list so we can style differently if needed
      if (items.length) blocks.push({ type: 'hgroup', items, style: listStyle });
      return;
    }

    // Images
    if (tag === 'img') {
      blocks.push({ type: 'image', src: resolveUrl($(node).attr('src') || ''), alt: $(node).attr('alt') || '', style: $(node).attr('style') || '' });
      return;
    }

    // Links & clickable labels (anything with onclick)
    if (tag === 'a' || $(node).attr('onclick')) {
      const href = resolveUrl($(node).attr('href') || '');
      const txt = $(node).text().trim() || href;
      blocks.push({ type: 'link', text: txt, href: href ? `${req.protocol}://${req.get('host')}/Applicationlauncher/WebBrowser.aspx?url=${href}` : '', style: $(node).attr('style') || '' });
      return;
    }

    // Fallback: walk children
    $(node).children().each((i, ch) => collect(ch));
  }

  ROOT.children().each((i, child) => collect(child));

  const MAX = 120;
  const render = blocks.slice(0, MAX);

  const currentUrlEsc = escapeXmlLocal(url);
  const title = escapeXmlLocal($('title').first().text().trim() || url);
  const goAction = `${req.protocol}://${req.get('host')}/Applicationlauncher/WebBrowser.aspx`;

  // --- Build MRML ---
  let mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="MiniWebBrowser" appid="lukatube.app/1.0" width="1280" height="720">
    <Header />
    <Panel left="0" top="0" width="1280" height="720">
      <Panel top="0" left="0" width="1280" height="88">
        <Text top="10" left="20" width="760" height="28" fontstyle="Reg22" foreground="argb(255,228,0,115)">${title}</Text>
        <EditText id="BrowserUrl" top="44" left="20" width="960" height="30" value="${currentUrlEsc}" hint="Enter URL..." />
        <Button id="BrowserGo" top="44" left="990" width="120" height="30" justification="center">
          <Text>Go</Text>
          <Actions><Event type="onclick" action="BrowseGo"/></Actions>
        </Button>
        <Actions>
          <Action name="BrowseGo" type="submit" data="BrowserUrl" url="page:${escapeXmlLocal(goAction)}" method="GET" />
        </Actions>
      </Panel>
`;

  for (const b of render) {
    const pos = parseStylePosition(b.style || '');
    const top = pos.top || 0;
    const left = pos.left || 0;
    const width = pos.width || 1200;
    const height = pos.height || 30;

    if (b.type === 'heading') {
      const style = b.level === 'h1' ? 'Reg28' : (b.level === 'h2' ? 'Reg24' : 'Reg22');
      mrml += `<Panel top="${top}" left="${left}" width="${width}" height="${height}"><Text width="100%" height="100%" fontstyle="${style}" foreground="argb(255,255,255,255)">${escapeXmlLocal(b.text)}</Text></Panel>\n`;
    } else if (b.type === 'paragraph') {
      mrml += `<Panel top="${top}" left="${left}" width="${width}" height="${height}"><Text width="100%" height="100%" fontstyle="Reg20">${escapeXmlLocal(b.text)}</Text></Panel>\n`;
    } else if (b.type === 'image') {
      if (b.src) mrml += `<Panel top="${top}" left="${left}" width="${width}" height="${height}"><Image width="100%" height="100%" src="${escapeXmlLocal(b.src)}" /></Panel>\n`;
    } else if (b.type === 'link') {
      mrml += `<Panel top="${top}" left="${left}" width="${width}" height="${height}"><Button width="100%" height="100%" href="${escapeXmlLocal(b.href)}"><Text>${escapeXmlLocal(b.text)}</Text></Button></Panel>\n`;
    } else if (b.type === 'listitem') {
      // kept for backwards compatibility, but ul/ol are now emitted as hgroup
      mrml += `<Panel top="${top}" left="${left}" width="${width}" height="${height}"><Text width="100%" height="100%" fontstyle="Reg18">• ${escapeXmlLocal(b.text)}</Text></Panel>\n`;
    } else if (b.type === 'hgroup') {
      // horizontal group using absolute positioning inside the Panel
      // distribute widths: if items have no explicit widths, split container width evenly
      mrml += `<Panel top="${top}" left="${left}" width="${width}" height="${height}">\n`;
      // determine if items have explicit widths
      let explicitWidths = false;
      const itPoss = b.items.map(it => parseStylePosition(it.style || ''));
      for (const ip of itPoss) if (ip.width && ip.width > 0) explicitWidths = true;

      let defaultItemWidth = 100;
      if (!explicitWidths && b.items.length > 0 && width > 0) {
        // leave small spacing between items (10px)
        const totalSpacing = Math.max(0, b.items.length - 1) * 10;
        defaultItemWidth = Math.max(60, Math.floor((width - totalSpacing) / b.items.length));
      }

      let xOffset = 0;
      for (let idx = 0; idx < b.items.length; idx++) {
        const it = b.items[idx];
        const itPos = itPoss[idx] || { top:0,left:0,width:0,height:0 };
        const itLeft = xOffset + (itPos.left || 0);
        const itTop = itPos.top || 0;
        const itWidth = (itPos.width && itPos.width > 0) ? itPos.width : defaultItemWidth;
        const itHeight = (itPos.height && itPos.height > 0) ? itPos.height : height;

        if (it.kind === 'img') {
          mrml += `<Panel top="${itTop}" left="${itLeft}" width="${itWidth}" height="${itHeight}"><Image width="100%" height="100%" src="${escapeXmlLocal(it.src)}" /></Panel>\n`;
        } else if (it.kind === 'text') {
          mrml += `<Panel top="${itTop}" left="${itLeft}" width="${itWidth}" height="${itHeight}"><Text width="100%" height="100%" fontstyle="Reg20">${escapeXmlLocal(it.text)}</Text></Panel>\n`;
        } else if (it.kind === 'link') {
          // clickable list item -> render as button (horizontal)
          const hrefEsc = it.href ? `${req.protocol}://${req.get('host')}/Applicationlauncher/WebBrowser.aspx?url=${escapeXmlLocal(it.href)}` : '';
          // If it.href already contains full URL we must ensure it isn't double-wrapped - original code used full redirect URL earlier.
          // We preserve the same pattern: use the prebuilt it.href if present.
          const btnHref = it.href ? it.href : '';
          mrml += `<Panel top="${itTop}" left="${itLeft}" width="${itWidth}" height="${itHeight}"><Button width="100%" height="100%" href="${escapeXmlLocal(btnHref)}"><Text>${escapeXmlLocal(it.text)}</Text></Button></Panel>\n`;
        }
        xOffset += itWidth + 10; // spacing
      }
      mrml += `</Panel>\n`;
    }
  }

  mrml += `</Panel></MrmlPage></uidescription>`;
  res.send(mrml);
});




const os = require('os');

app.get('/Applicationlauncher/PlayYouTubeVideo.aspx', async (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const defaultVideoId = 'dQw4w9WgXcQ';
  const videoId = req.query.videoId || defaultVideoId;

  const videosFolder = path.join(__dirname, 'youtubeclone', 'videos_mediaroom');
  if (!fs.existsSync(videosFolder)) fs.mkdirSync(videosFolder, { recursive: true });

  const localFile = path.join(videosFolder, `${videoId}.mp4`);
  let videoname = `Video_${videoId}`;

  try {
    if (!fs.existsSync(localFile)) {
      console.log('Downloading video from RapidAPI:', videoId);

      const fetch = require('node-fetch');
      const https = require('https');

      // ---------- RapidAPI ----------
      const rapidUrl =
        `https://youtube-media-downloader.p.rapidapi.com/v2/video/details` +
        `?videoId=${videoId}&urlAccess=normal&videos=auto&audios=auto`;

      const rapidResp = await fetch(rapidUrl, {
        headers: {
          'x-rapidapi-host': 'youtube-media-downloader.p.rapidapi.com',
          'x-rapidapi-key': 'b8d236e82cmsh17bfa10c34b5c71p104388jsn239a1ead0660'
        }
      });

      const data = await rapidResp.json();
      if (!data?.videos?.items?.length) {
        throw new Error('No videos returned from RapidAPI');
      }

      const videoItem =
        data.videos.items.find(v => v.hasAudio) || data.videos.items[0];

      const remoteVideoUrl = videoItem.url;
      videoname = data.title || videoname;

      // ---------- GET IP FROM OS (Ethernet 4) ----------
      const nets = os.networkInterfaces();
      let localIP = null;

      for (const name of Object.keys(nets)) {
        if (name.toLowerCase() === 'ethernet 4') {
          for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
              localIP = net.address;
            }
          }
        }
      }

      console.log('Download via:', localIP || 'default interface');

      // ---------- DOWNLOAD (handles 302 once) ----------
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(localFile);

        const startRequest = (url) => {
          const r = https.get(url, {
            localAddress: localIP || undefined,
            timeout: 60000
          }, (resp) => {

            // handle redirect
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
              resp.resume();
              return startRequest(resp.headers.location);
            }

            if (resp.statusCode !== 200) {
              reject(new Error('HTTP ' + resp.statusCode));
              return;
            }

            resp.pipe(file);
            file.on('finish', () => file.close(resolve));
          });

          r.on('error', reject);
        };

        startRequest(remoteVideoUrl);
      });

      console.log('Downloaded:', localFile);
    } else {
      console.log('Video already exists locally:', localFile);
    }
  } catch (err) {
    console.error('Error fetching RapidAPI video:', err);

    // ---------- FALLBACK ----------
    const fallbackPath = path.join(videosFolder, 'fallback.mp4');
    if (fs.existsSync(fallbackPath)) {
      fs.copyFileSync(fallbackPath, localFile);
    }
    videoname = 'Fallback Video';
  }

  const videoUrl =
    `${req.protocol}://${req.get('host')}/youtubeclone/videos_mediaroom/` +
    encodeURIComponent(path.basename(localFile));

  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="YouTubePage" appid="lukatube.app/1.0" width="1280" height="720">
    <Header />
    <Panel>
      <Video id="video" visible="true" showbusyindicator="true"
             width="1280" height="720"
             timeshiftenabled="true" timeshiftbuffersize="3600"
             allowtrickmodes="true"
             tuneurl="${videoUrl}" />
      <Text id="VideoInfo" highlightcolor="argb(255,228,0,115)"
            margin="rect(30,20,0,0)" width="800" height="80">
        Video Name: ${videoname}
        \n Current Time: {Time} Current Date: {Date}
        \n Device: ${req.get('user-agent')}
      </Text>
    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);
});

const axios = require('axios');

// Helper: get IPv4 address of Ethernet 4
function getEthernet4IP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const lname = name.toLowerCase();
    if (lname.includes('ethernet 4') || lname.includes('eth4') || lname.includes('ethernet4')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }
  return null; // not found
}


function getEthernet4Ip() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    if (name.toLowerCase().includes('ethernet 4')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  }
  return null;
}



app.get('/Applicationlauncher/YouTube.aspx', async (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const offset = Math.max(0, Number(req.query.offset) || 0);
  const pageSize = Math.max(1, Number(req.query.pageSize) || 12);
  const rawSearch = (req.query.SearchYouTube || '').toString().trim();
  const searchLower = rawSearch.toLowerCase();

  // --- Fetch YouTube videos via RapidAPI ---
  let videos = [];
  try {
    const response = await axios.get(
      'https://youtube-media-downloader.p.rapidapi.com/v2/search/videos',
      {
        params: {
          keyword: rawSearch || 'Rick Astley',
          uploadDate: 'all',
          duration: 'all',
          sortBy: 'relevance'
        },
        headers: {
          'X-RapidAPI-Host': 'youtube-media-downloader.p.rapidapi.com',
          'X-RapidAPI-Key': 'b8d236e82cmsh17bfa10c34b5c71p104388jsn239a1ead0660'
        },
        timeout: 10000
      }
    );

    const items = response.data?.items || [];
    videos = items.map(v => ({
        id: v.id || v.videoId || '',
        title: v.title || 'Untitled'
    }));

  } catch (err) {
    console.log('RapidAPI request failed:', err.message);
  }

  // Local filter
  if (searchLower) videos = videos.filter(v => v.title.toLowerCase().includes(searchLower));

  const total = videos.length;
  const pageVideos = videos.slice(offset, offset + pageSize);

  // --- Build MRML in LukaTube list style ---
  let mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="YouTubeList" appid="lukatube.app/1.0" width="1280" height="720">
    <Header />
    <Actions>
      <Action
        name="SearchYouTube"
        type="submit"
        data="SearchYouTube"
        url="page:${req.protocol}://${req.get('host')}/Applicationlauncher/YouTube.aspx"
        method="GET" />
    </Actions>
    <Panel id="MainPanel" top="0" left="0" width="1280" height="720">
      <Text id="Title" top="10" left="20" width="900" height="30" fontstyle="Reg26" foreground="argb(255,228,0,115)">
        YouTube - Videos ${ total ? `(showing ${offset+1}-${Math.min(offset+pageSize, total)} of ${total})` : '' }
      </Text>
      <EditText
        id="SearchYouTube"
        top="50"
        left="20"
        width="400"
        height="40"
        hint="Search YouTube..."
        value="${escapeXml(rawSearch)}" />
      <Button id="SearchButton" top="50" left="430" width="140" height="40" justification="center">
        <Text>Search</Text>
        <Actions>
          <Event type="onclick" action="SearchYouTube"/>
        </Actions>
      </Button>
      ${rawSearch ? `
      <Text
        id="SearchResultsInfo"
        top="100"
        left="20"
        width="700"
        height="30"
        fontstyle="Reg20"
        foreground="argb(255,200,200,200)">
        ${total} search result${total !== 1 ? 's' : ''} found for "${escapeXml(rawSearch)}"
      </Text>` : ''}
      <Panel id="VideoList" top="${rawSearch ? 140 : 100}" left="20" width="1240" height="580">
`;

  // --- Add video title buttons only (no thumbnail) ---
  pageVideos.forEach((v, i) => {
    const top = 10 + i * 50; // each button 50px tall
    mrml += `
        <Button id="videoBtn${i}" top="${top}" left="0" width="1240" height="40"
                href="page:${req.protocol}://${req.get('host')}/Applicationlauncher/PlayYouTubeVideo.aspx?videoId=${encodeURIComponent(v.id)}">
          <Text top="0" left="10" width="1220" height="40" fontstyle="Reg22" foreground="argb(255,255,255,255)">
            ${escapeXml(v.title)}
          </Text>
        </Button>
    `;
  });

  // --- Load more button ---
  const nextOffset = offset + pageSize;
  if (nextOffset < total) {
    const nextUrl = `${req.protocol}://${req.get('host')}/Applicationlauncher/YouTube.aspx?offset=${nextOffset}&pageSize=${pageSize}${rawSearch ? `&SearchYouTube=${encodeURIComponent(rawSearch)}` : ''}`;
    mrml += `
      <Button id="loadMoreBtn" top="${10 + pageVideos.length * 50}" left="470" width="300" height="40" href="page:${nextUrl}">
        <Text>Load more videos...</Text>
      </Button>
    `;
  }

  mrml += `
      </Panel>
    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);
});

app.get('/Applicationlauncher/LukifyVideos.aspx', async (req, res) => {
  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const hostAbsolute = 'http://172.16.40.101'; // истиот host
  const feedUrl = 'http://172.16.40.100/social_feed.php';

  let feed = { posts: [], page: 1, limit: 10, total_posts: 0, has_more: false };

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Number(req.query.pageSize || 10));
  const rawSearch = (req.query.SearchLukaTube || '').toString().trim().toLowerCase();

  try {
    const fetchFn = getFetch();
    if (fetchFn) {
      const r = await fetchFn(`${feedUrl}?page=${page}&limit=${limit}${rawSearch ? `&SearchLukaTube=${encodeURIComponent(rawSearch)}` : ''}`);
      if (r.ok) feed = await r.json();
    }
  } catch(e) {
    console.error('Failed to fetch feed:', e);
  }

  const posts = feed.posts || [];
  const totalPosts = feed.total_posts || posts.length;
  const hasMore = feed.has_more === true;

  let mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="LukifyVideosList" appid="lukatube.app/1.0" width="1280" height="720">
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
        Lukify Videos ${totalPosts ? `(page ${page}, showing ${posts.length} of ${totalPosts})` : ''}
      </Text>
`;

  let topOffset = 50;

  for (let post of posts) {
    const userName = escapeXml(stripEmojis(post.user?.full_name || post.user?.username || 'Unknown'));
    const caption = escapeXml(stripEmojis(post.caption || 'No title'));

    let videoUrl = post.video_url || '';
    if (!videoUrl || videoUrl === 'not found') continue;
    videoUrl = videoUrl.replace(/https?:\/\/lukaserver\.ddns\.net/gi, 'http://172.16.40.100');

    let videoId;
    try {
      videoId = encodeURIComponent(Buffer.from(videoUrl).toString('base64'));
    } catch (err) {
      console.error('Base64 encode error', err, videoUrl);
      continue;
    }

    const playUrl = `${hostAbsolute}/Applicationlauncher/PlayLukifyVideo.aspx?videoId=${videoId}`;

    // Song info
    let songText = '';
    if (post.song) {
      const songTitle = escapeXml(post.song.title || 'Unknown song');
      const songArtist = escapeXml(post.song.artist || 'Unknown artist');
      songText = ` (Song: ${songTitle} by ${songArtist})`;
    }

    // Profile picture
    const profilePic = post.user?.profile_picture_url ? `<Image top="5" left="0" width="50" height="50" src="${post.user.profile_picture_url}" />` : '';
    const buttonLeft = post.user?.profile_picture_url ? 60 : 0;
    const buttonWidth = post.user?.profile_picture_url ? 1180 : 1240;
    const textWidth = post.user?.profile_picture_url ? 1112 : 1224;

    mrml += `
  <Panel top="${topOffset}" left="20" width="1240" height="60">
    ${profilePic}
    <Button top="0" left="${buttonLeft}" width="${buttonWidth}" height="50" href="page:${playUrl}">
      <Text top="0" left="8" width="${textWidth}" height="50">
       Caption: ${caption}${songText} by ${userName}
      </Text>
    </Button>
  </Panel>
    `;
    topOffset += 70;
  }

  // Load more button
  if (hasMore) {
    const nextPage = page + 1;
    const nextUrl = `${hostAbsolute}/Applicationlauncher/LukifyVideos.aspx?page=${nextPage}&pageSize=${limit}${rawSearch ? `&SearchLukaTube=${encodeURIComponent(rawSearch)}` : ''}`;

    mrml += `
      <Panel id="loadmorePanel" width="1200" height="80" top="${topOffset + 10}" left="40">
        <Button id="loadMoreBtn" top="10" left="0" width="600" height="40" fontstyle="Reg26" 
          href="page:${escapeXml(nextUrl)}">
          <Text top="0" left="8" width="584" height="40">Load more videos...</Text>
        </Button>
      </Panel>
    `;
  }

  mrml += `
    </Panel>
  </MrmlPage>
</uidescription>`;

  res.send(mrml);

  // ---------------- HELPERS ----------------
  function escapeXml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function stripEmojis(str) {
    return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  }
});




app.get('/Applicationlauncher/PlayLukifyVideo.aspx', (req, res) => {
  const videoId = req.query.videoId || '';
  if (!videoId) {
    return res.status(400).send('Missing videoId');
  }

  let videoUrl = '';
  try {
    // decode base64
    videoUrl = Buffer.from(videoId, 'base64').toString('utf8');
  } catch (e) {
    return res.status(400).send('Invalid videoId');
  }

  // MRML page to play video
  const mrml = `<?xml version="1.0" encoding="utf-8"?>
<uidescription version="3.0">
  <MrmlPage id="PlayVideoPage" appid="lukatube.app/1.0" width="1280" height="720">

    <Header />

    <!-- Actions -->
    <Actions>

      <!-- Exit app -->
      <Action name="scriptExit" type="script" function="handleAppLeave"/>

    </Actions>

     <Scripts>
    <Script>
    <![CDATA[
      function setVideo(url) {
        if (!url) return;

        // Stop current playback
        video.SetProperty("tuneurl", "");

        // Tune to new LukaTube video
        video.SetProperty("tuneurl", url);
      }

      function channelUpPlay(nextUrl) {
        setVideo(nextUrl);
      }

      function channelDownPlay(prevUrl) {
        setVideo(prevUrl);
      }

      function playNextVideo(nextUrl) {
        setVideo(nextUrl);
      }

      function handleAppLeave() {
        Application.Exit();
      }
    ]]>
  </Script>
  </Scripts>


    <Panel>

      <!-- VIDEO -->
      <Video
        id="video"
        width="1280"
        height="720"
        visible="true"
        showbusyindicator="true"
        allowtrickmodes="true"
        timeshiftenabled="true"
        timeshiftbuffersize="3600"
        tuneurl="${escapeXml(videoUrl)}">
      </Video>

      <!-- INFO TEXT -->
      <Text
        id="Main_WelcomeText"
        highlightcolor="argb(255,228,0,115)"
        margin="rect(30,20,0,0)"
        width="500"
        height="80">
        Current Time: {Time} Current Date: {Date}
        Device info: ${req.get("user-agent")}
      </Text>

    </Panel>
  </MrmlPage>
</uidescription>`;

  res.set({
    'Content-Type': 'application/vnd.microsoft-tvui+xml; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.send(mrml);

  function escapeXml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});




app.listen(port, () => {
  console.log(`Mediaroom MaxTV Application server running on http://172.16.40.101:${port}`);
  const ff = getFetch();
  console.log('fetch available:', !!ff);
  console.log('local video folder:', videoDirFs, 'exists=', fs.existsSync(videoDirFs));
});
