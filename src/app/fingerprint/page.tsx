'use client';

import { useEffect, useState } from 'react';

interface ServerData {
  ip: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
  acceptEncoding: string | null;
  accept: string | null;
  dnt: string | null;
  secChUa: string | null;
  secChUaMobile: string | null;
  secChUaPlatform: string | null;
  secFetchSite: string | null;
  secFetchMode: string | null;
  connection: string | null;
  xForwardedFor: string | null;
  xForwardedProto: string | null;
}

interface ClientData {
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  pixelRatio: number;
  availWidth: number;
  availHeight: number;
  timezone: string;
  timezoneOffset: number;
  language: string;
  languages: string[];
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number | undefined;
  maxTouchPoints: number;
  cookiesEnabled: boolean;
  doNotTrack: string | null;
  canvasHash: string;
  webglRenderer: string;
  webglVendor: string;
  audioHash: string;
  fonts: string[];
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCanvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d')!;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('GIPC fingerprint 🎹', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('GIPC fingerprint 🎹', 4, 17);
    const data = canvas.toDataURL();
    // Simple hash: sum char codes
    let h = 0;
    for (let i = 0; i < data.length; i++) h = (Math.imul(31, h) + data.charCodeAt(i)) | 0;
    return h.toString(16);
  } catch {
    return 'unavailable';
  }
}

function getWebGLInfo(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return { renderer: 'unavailable', vendor: 'unavailable' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return { renderer: 'no_ext', vendor: 'no_ext' };
    return {
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown',
      vendor:   gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   || 'unknown',
    };
  } catch {
    return { renderer: 'error', vendor: 'error' };
  }
}

async function getAudioHash(): Promise<string> {
  try {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const osc = ctx.createOscillator();
    const cmp = ctx.createDynamicsCompressor();
    osc.connect(cmp);
    cmp.connect(ctx.destination);
    osc.start(0);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0).slice(4500, 5000);
    let h = 0;
    for (const v of data) h = (Math.imul(31, h) + Math.round(v * 1e9)) | 0;
    return h.toString(16);
  } catch {
    return 'unavailable';
  }
}

function detectFonts(): string[] {
  const testFonts = [
    'Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New',
    'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Helvetica', 'Tahoma',
    'Palatino', 'Garamond', 'Bookman', 'Arial Black', 'Avant Garde',
  ];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const text = 'mmmmmmmmlli';
  const baseline = '16px monospace';
  ctx.font = baseline;
  const baseWidth = ctx.measureText(text).width;
  return testFonts.filter(font => {
    ctx.font = `16px '${font}', monospace`;
    return ctx.measureText(text).width !== baseWidth;
  });
}

function collectClient(): ClientData {
  const { renderer, vendor } = getWebGLInfo();
  return {
    screenWidth:        screen.width,
    screenHeight:       screen.height,
    colorDepth:         screen.colorDepth,
    pixelRatio:         window.devicePixelRatio,
    availWidth:         screen.availWidth,
    availHeight:        screen.availHeight,
    timezone:           Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset:     new Date().getTimezoneOffset(),
    language:           navigator.language,
    languages:          [...navigator.languages],
    platform:           navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory:       (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    maxTouchPoints:     navigator.maxTouchPoints,
    cookiesEnabled:     navigator.cookieEnabled,
    doNotTrack:         navigator.doNotTrack,
    canvasHash:         getCanvasHash(),
    webglRenderer:      renderer,
    webglVendor:        vendor,
    audioHash:          '',   // filled async
    fonts:              detectFonts(),
  };
}

const STRONG_KEYS: (keyof ClientData | keyof ServerData)[] = [
  'ip', 'canvasHash', 'webglRenderer', 'audioHash', 'fonts',
  'screenWidth', 'screenHeight', 'pixelRatio', 'colorDepth',
  'timezone', 'language', 'hardwareConcurrency', 'deviceMemory',
  'platform', 'userAgent',
];

export default function FingerprintPage() {
  const [server, setServer] = useState<ServerData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [fingerprint, setFingerprint] = useState('');

  useEffect(() => {
    fetch('/api/fingerprint').then(r => r.json()).then(setServer);

    const c = collectClient();
    getAudioHash().then(audioHash => {
      const full = { ...c, audioHash };
      setClient(full);
    });
    setClient(c);
  }, []);

  useEffect(() => {
    if (!server || !client) return;
    const combined = { ...server, ...client };
    const str = STRONG_KEYS.map(k => String((combined as Record<string, unknown>)[k] ?? '')).join('|');
    sha256(str).then(setFingerprint);
  }, [server, client]);

  const Row = ({ label, value, strong }: { label: string; value: unknown; strong?: boolean }) => (
    <tr style={{ borderBottom: '1px solid #2a2d3a' }}>
      <td style={{ padding: '0.4rem 0.6rem', color: strong ? '#a78bfa' : '#9ca3af', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', wordBreak: 'break-all', color: strong ? '#f0f0f0' : '#ccc' }}>
        {Array.isArray(value) ? value.join(', ') || '—' : String(value ?? '—')}
      </td>
    </tr>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '0.85rem', color: '#6c63ff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{title}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1a1d27', borderRadius: 8, overflow: 'hidden' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif', color: '#f0f0f0' }}>
      <h1 style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>Device Fingerprint Explorer</h1>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '2rem' }}>
        All signals collectable from this device. Purple = used in combined fingerprint.
      </p>

      {fingerprint && (
        <div style={{ background: '#1a1d27', borderRadius: 8, padding: '1rem', marginBottom: '2rem', border: '1px solid #6c63ff' }}>
          <div style={{ fontSize: '0.75rem', color: '#6c63ff', marginBottom: '0.25rem' }}>COMBINED FINGERPRINT (SHA-256)</div>
          <code style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{fingerprint}</code>
        </div>
      )}

      <Section title="Server-side — HTTP headers">
        <Row label="IP address"           value={server?.ip}              strong />
        <Row label="User-Agent"           value={server?.userAgent}       strong />
        <Row label="Accept-Language"      value={server?.acceptLanguage} />
        <Row label="Accept-Encoding"      value={server?.acceptEncoding} />
        <Row label="Accept"               value={server?.accept} />
        <Row label="sec-ch-ua"            value={server?.secChUa} />
        <Row label="sec-ch-ua-mobile"     value={server?.secChUaMobile} />
        <Row label="sec-ch-ua-platform"   value={server?.secChUaPlatform} />
        <Row label="DNT"                  value={server?.dnt} />
        <Row label="x-forwarded-for"      value={server?.xForwardedFor} />
        <Row label="x-forwarded-proto"    value={server?.xForwardedProto} />
      </Section>

      <Section title="Client-side — Screen &amp; display">
        <Row label="Screen resolution"    value={client ? `${client.screenWidth} × ${client.screenHeight}` : null} strong />
        <Row label="Available area"       value={client ? `${client.availWidth} × ${client.availHeight}` : null} />
        <Row label="Pixel ratio"          value={client?.pixelRatio}  strong />
        <Row label="Colour depth"         value={client?.colorDepth}  strong />
      </Section>

      <Section title="Client-side — System">
        <Row label="Timezone"             value={client?.timezone}            strong />
        <Row label="Timezone offset"      value={client ? `UTC${client.timezoneOffset <= 0 ? '+' : ''}${-client.timezoneOffset / 60}` : null} />
        <Row label="Language"             value={client?.language}            strong />
        <Row label="Languages"            value={client?.languages} />
        <Row label="Platform"             value={client?.platform}            strong />
        <Row label="CPU threads"          value={client?.hardwareConcurrency} strong />
        <Row label="Device memory (GB)"   value={client?.deviceMemory}        strong />
        <Row label="Max touch points"     value={client?.maxTouchPoints} />
        <Row label="Cookies enabled"      value={client?.cookiesEnabled} />
        <Row label="Do Not Track"         value={client?.doNotTrack} />
      </Section>

      <Section title="Client-side — Hardware probes">
        <Row label="Canvas hash"          value={client?.canvasHash}    strong />
        <Row label="WebGL renderer"       value={client?.webglRenderer} strong />
        <Row label="WebGL vendor"         value={client?.webglVendor} />
        <Row label="Audio context hash"   value={client?.audioHash}     strong />
        <Row label="Detected fonts"       value={client?.fonts}         strong />
      </Section>
    </div>
  );
}
