import type { DemoCard } from '@/services/demoCard';

/**
 * The member card as a PNG, drawn onto a canvas at 300 dpi (1011 x 638 px).
 *
 * The same layout as `components/portal/MemberCard.tsx`, in the same shares of
 * the card's width, so the file and the screen agree. The QR is drawn with
 * smoothing off, so its modules stay crisp when printed or photographed.
 * No new dependency: this is the 2D canvas API and nothing else.
 */

const WIDTH = 1011; // 85.6 mm at 300 dpi
const HEIGHT = 638; // 54 mm at 300 dpi
const DISPLAY = "'Tiro Devanagari Hindi', Georgia, serif";
const BODY = "'IBM Plex Sans', system-ui, sans-serif";

/** A share of the card's width, in pixels: `w(5)` is 5cqw. */
const w = (share: number) => (share / 100) * WIDTH;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The card image could not be loaded.'));
    image.src = url;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export interface CardText {
  brand: string;
  brandHindi: string;
  memberIdLabel: string;
  issuedLabel: string;
  scanAt: string;
}

export async function drawCard(card: DemoCard, text: CardText, qrUrl: string): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`700 ${w(5.6)}px ${DISPLAY}`),
    document.fonts.load(`600 ${w(6)}px ${BODY}`),
    document.fonts.load(`400 ${w(3.2)}px ${BODY}`),
  ]).catch(() => undefined);
  const qr = await loadImage(qrUrl);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');

  // The card.
  roundedRect(ctx, 0, 0, WIDTH, HEIGHT, w(3.7));
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#1D4B36';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // The foot band and its line.
  const band = w(2.7) + 2 * w(2);
  ctx.fillStyle = '#163A2A';
  ctx.fillRect(0, HEIGHT - band, WIDTH, band);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `400 ${w(2.7)}px ${BODY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text.scanAt, w(5.5), HEIGHT - band / 2);

  // The QR on its white panel, centred in the space above the band.
  const qrSide = w(34);
  const pad = w(1.2);
  const panelX = WIDTH - w(5.5) - qrSide - 2 * pad;
  const panelY = (HEIGHT - band - qrSide - 2 * pad) / 2 + w(1);
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, panelX, panelY, qrSide + 2 * pad, qrSide + 2 * pad, w(1.4));
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, panelX + pad, panelY + pad, qrSide, qrSide);

  // The wordmark.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${w(5.6)}px ${DISPLAY}`;
  ctx.fillText(text.brand, w(5.5), w(5) + w(5.6) * 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `400 ${w(3)}px ${DISPLAY}`;
  ctx.fillText(text.brandHindi, w(5.5), w(5) + w(5.6) + w(1) + w(3) * 0.8);

  // The member, bottom-aligned above the band.
  let y = HEIGHT - band - w(3);
  const line = (value: string, font: string, color: string, x = w(5.5)) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const labelWidth = (() => {
    ctx.font = `400 ${w(2.9)}px ${BODY}`;
    return Math.max(
      ctx.measureText(text.memberIdLabel).width,
      ctx.measureText(text.issuedLabel).width,
    );
  })();
  const valueX = w(5.5) + labelWidth + w(2.4);
  line(text.issuedLabel, `400 ${w(2.9)}px ${BODY}`, 'rgba(255,255,255,0.75)');
  line(card.issuedOn, `400 ${w(2.9)}px ${BODY}`, '#FFFFFF', valueX);
  y -= w(2.9) * 1.5;
  line(text.memberIdLabel, `400 ${w(2.9)}px ${BODY}`, 'rgba(255,255,255,0.75)');
  line(card.memberId, `600 ${w(2.9)}px ${BODY}`, '#FFFFFF', valueX);
  y -= w(2.4) + w(3.2) * 1.4;
  line(card.institution, `400 ${w(3.2)}px ${BODY}`, 'rgba(255,255,255,0.9)');
  y -= w(3.2) * 1.4;
  line(card.role, `400 ${w(3.2)}px ${BODY}`, 'rgba(255,255,255,0.9)');
  y -= w(3.2) * 1.2 + w(0.6);
  line(card.name, `600 ${w(6)}px ${BODY}`, '#FFFFFF');

  ctx.restore();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image.'))), 'image/png'),
  );
}
