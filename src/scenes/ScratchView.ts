import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Rectangle,
  Sprite,
  Assets,
} from 'pixi.js';
import {
  state,
  saveNow,
  isBackstopReady,
  consumeBackstopFlag,
  getBackstopFloorPct,
  getStreakFactor,
} from '../core/state.js';
import { getTiers } from '../data/content.js';
import { getCurrentItem, setCurrentItem } from '../core/session.js';
import { generateTicket } from '../systems/ticketGen.js';
import { addCash } from '../core/currency.js';
import { toast } from '../ui/alerts.js';
import {
  getPrizeMultiplier,
  getScratchMode,
  getScratchParallelCount, // Pro parallel count (1, 2, or 3)
} from '../core/upgrades.js';
import { rng } from '../core/rng.js';
import { incTilesScratched } from '../core/state.js';

// ================= SIZING DIALS =================
const DESIGN_W = 600;
const DESIGN_H = 850;
const USER_SCALE = 1.0;
const MAX_WIDTH_FRAC = 0.95;
const MAX_HEIGHT_FRAC = 0.95;
const EXTRA_TOP = 12;
const EXTRA_BOTTOM = 18;
// ===============================================

interface Cell {
  container: any;
  numText: any;
  prizeText: any;
  hit: any;
  cover?: any;
  rect: { x: number; y: number; w: number; h: number };
  index: number;
  isWin: boolean;
  bg: any;
  revealed: boolean;
}

interface Board {
  item: any; // inventory item
  ticket: any; // generated ticket data (tiles, winning, etc.)
  tier: any; // tier definition (price, visuals)
  container: any; // PIXI container hosting this board
  cells: Cell[];
  cols: number;
  rows: number;
  claimRect: { x: number; y: number; w: number; h: number } | null;
  progressText: any;
  bonus: { container?: any; cover?: any; revealed?: boolean; amount?: number };
}

function hexToNum(hex?: string): number {
  if (!hex) return 0x10b981;
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) ? n : 0x10b981;
}

interface VisualBundle {
  bg?: any | null;
  cover?: any | null;
  fontName?: string | null;
}
const visualCache = new Map<string, VisualBundle>();

function isFontFile(u: string) {
  return /\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/.test(u);
}
function resolveFontUrl(u: string): string {
  // absolute or http(s) → use as-is
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('/')) return u;
  // if caller passed "AldotheApache.ttf" etc. → serve from /fonts
  return `./fonts/${u.split('/').pop()}`;
}
async function ensureFamilyReady(family: string): Promise<void> {
  const dfonts: any = (document as any).fonts;
  try {
    if (dfonts?.check?.(`16px "${family}"`)) return;
  } catch {}

  const candidates = [
    `./fonts/${family}.woff2`,
    `./fonts/${family}.ttf`,
    `./fonts/${family}.otf`,
  ];

  for (const url of candidates) {
    try {
      const face = new FontFace(family, `url(${url})`, {
        style: 'normal',
        weight: 'normal',
      });
      await face.load();
      dfonts?.add?.(face);
      await dfonts?.load?.(`16px "${family}"`);
      return; // success
    } catch {
      // try next extension
    }
  }
  // If none load, we'll silently fall back to system fonts.
}
async function ensureTierVisuals(tier: any): Promise<VisualBundle> {
  const cached = visualCache.get(tier.id);
  if (cached) return cached;
  const out: VisualBundle = { bg: null, cover: null, fontName: null };

  const fontField = (tier.visual?.font as string | undefined) || '';
  if (fontField) {
    if (
      isFontFile(fontField) ||
      fontField.startsWith('/') ||
      fontField.startsWith('http')
    ) {
      const url = resolveFontUrl(fontField);
      const family = `TicketFont_${tier.id}`;
      try {
        const dfonts: any = (document as any).fonts;
        const already = Array.from(dfonts || []).some(
          (f: any) => (f as FontFace)?.family === family
        );
        if (!already) {
          const face = new FontFace(family, `url(${url})`, {
            style: 'normal',
            weight: 'normal',
          });
          await face.load();
          dfonts.add(face);
        }
        await dfonts.ready;
        out.fontName = family;
      } catch {
        out.fontName = null;
      }
    } else {
      try {
        await ensureFamilyReady(fontField);
      } catch {}
      out.fontName = fontField;
    }
  }

  const bgUrl = tier.visual?.bgImage as string | undefined;
  const coverUrl = tier.visual?.coverImage as string | undefined;
  if (bgUrl) {
    try {
      out.bg = await Assets.load(bgUrl);
    } catch {}
  }
  if (coverUrl) {
    try {
      out.cover = await Assets.load(coverUrl);
    } catch {}
  }

  visualCache.set(tier.id, out);
  return out;
}

export class ScratchView extends Container {
  private ticketArea: any;
  private claimBtn = document.getElementById('claim') as HTMLButtonElement;
  private moneyEl = document.getElementById('money') as HTMLSpanElement;

  // Multi-board
  private boards: Board[] = [];
  private linked: { item: any; ticket: any }[] = [];

  // Viewport state
  private lastViewW = 0;
  private lastViewH = 0;

  // Optional overlay/parallax only for single-board (kept off in multi to simplify)
  private fxOverlay: any = null;
  private bgSprite: any = null;
  private parallaxStrength = 6;

  constructor(_app: any) {
    super();
    this.ticketArea = new Container();
    (this as any).addChild(this.ticketArea);
    (this as any).eventMode = 'static';
    this.ticketArea.eventMode = 'static';

    // Position the HTML claim button by JS
    const s = this.claimBtn.style;
    s.position = 'absolute';
    s.left = '0px';
    s.top = '0px';
    s.width = '0px';
    s.height = '0px';
    s.transform = 'none';
    s.bottom = 'auto';
    s.display = 'none';
    s.zIndex = '50';
    s.cursor = 'pointer';
  }

  onEnter() {
    window.dispatchEvent(new CustomEvent('fx:enable'));
    this.hideClaim();
    this.loadCurrentAndLink();
    this.buildTicket().catch(() => {});
  }
  onExit() {
    window.dispatchEvent(new CustomEvent('fx:disable'));
    window.dispatchEvent(
      new CustomEvent('fx:set-holes', { detail: { holes: [] } })
    );
    this.hideClaim();
    this.clearTicket();
  }

  // Collect 1–3 linked same-tier tickets based on Pro parallel level
  private loadCurrentAndLink() {
    const id = getCurrentItem();
    const item = id
      ? (state.inventory as any[]).find((i) => i.id === id) ?? null
      : null;
    this.linked = [];
    if (!item) return;

    if (!item.ticket) item.ticket = generateTicket(item.tierId, item.serialId);
    this.linked.push({ item, ticket: item.ticket });

    const want = Math.max(1, getScratchParallelCount()); // 1/2/3
    if (want > 1) {
      const extras = (state.inventory as any[])
        .filter(
          (it) =>
            it.tierId === item.tierId &&
            it.id !== item.id &&
            it.state === 'sealed'
        )
        .slice(0, want - 1);
      for (const ex of extras) {
        if (!ex.ticket) ex.ticket = generateTicket(ex.tierId, ex.serialId);
        this.linked.push({ item: ex, ticket: ex.ticket });
      }
    }
    saveNow();
  }

  private clearTicket() {
    this.boards = [];
    this.ticketArea.removeChildren?.();

    // clear overlay/parallax
    if (this.fxOverlay?.destroy) this.fxOverlay.destroy();
    this.fxOverlay = null;
    this.bgSprite = null;
    this.ticketArea.off('globalpointermove', this.onPointerMove);
  }

  // Backstop per-ticket
  private applyBackstopIfReady(ticket: any, tier: any) {
    if (!isBackstopReady() || !ticket || ticket.backstopApplied) return;

    const floor = Math.floor(tier.price * getBackstopFloorPct());
    const wins = ticket.winning as number[];

    let current = 0;
    for (const t of ticket.tiles)
      if (wins.includes(t.num)) current += t.prize || 0;
    if (current >= floor) {
      consumeBackstopFlag();
      ticket.backstopApplied = true;
      saveNow();
      return;
    }

    let idx = ticket.tiles.findIndex((t: any) => wins.includes(t.num));
    if (idx < 0) idx = 0;
    const need = floor - current;
    const tile = ticket.tiles[idx];
    tile.num = wins[0];
    tile.prize = Math.max(tile.prize || 0, need);

    ticket.backstopApplied = true;
    consumeBackstopFlag();
    saveNow();
    toast(`Backstop active: floor $${floor}`, 'info');
  }

  // Bonus box per board
  private setupBonusBox(board: Board, yStart: number) {
    const tier = board.tier;
    const ticket = board.ticket;
    const hasBonusBox = !!tier.mechanics?.hasBonusBox;
    if (!hasBonusBox) return { yAfter: yStart };

    ticket.bonus ||= {};
    if (typeof ticket.bonus.amount !== 'number') {
      const r = rng();
      let pct = 0.1;
      if (r > 0.95) pct = 0.3;
      else if (r > 0.75) pct = 0.2;
      else if (r > 0.45) pct = 0.15;
      ticket.bonus.amount = Math.max(1, Math.floor(tier.price * pct));
      ticket.bonus.revealed = false;
      saveNow();
    }

    const boxH = 44;
    const boxW = DESIGN_W - 48;
    const left = 24;

    const cont = new Container();
    cont.position.set(Math.round(left), Math.round(yStart));
    board.container.addChild(cont);

    const ACCENT = hexToNum(tier.visual?.accentHex);

    const bg = new Graphics()
      .roundRect(0, 0, Math.round(boxW), Math.round(boxH), 12)
      .fill(0x0f1723)
      .stroke({ color: ACCENT, width: 2, alpha: 0.9 });

    const label = new Text({
      text: ticket.bonus.revealed
        ? `Bonus: $${ticket.bonus.amount}`
        : 'Bonus Box',
      style: new TextStyle({ fill: 0xe6f1ff, fontSize: 20, fontWeight: '600' }),
    });
    label.anchor.set(0.5);
    label.position.set(Math.round(boxW / 2), Math.round(boxH / 2));

    const cover: any = new Graphics()
      .roundRect(0, 0, Math.round(boxW), Math.round(boxH), 12)
      .fill(0x1f2937);
    cover.alpha = ticket.bonus.revealed ? 0 : 1;

    const hit = new Graphics()
      .roundRect(0, 0, Math.round(boxW), Math.round(boxH), 12)
      .fill(0xffffff);
    hit.alpha = 0.001;
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.on('pointertap', () => {
      if (ticket.bonus.revealed) return;
      ticket.bonus.revealed = true;
      cover.alpha = 0;
      label.text = `Bonus: $${ticket.bonus.amount}`;
      saveNow();
    });

    cont.addChild(bg, label, cover, hit);

    board.bonus.container = cont;
    board.bonus.cover = cover;
    board.bonus.revealed = !!ticket.bonus.revealed;
    board.bonus.amount = ticket.bonus.amount;

    return { yAfter: Math.round(yStart + boxH + 14) };
  }

  // Build 1–3 boards side-by-side
  private async buildTicket() {
    this.clearTicket();
    this.boards = [];

    const main = this.linked[0];
    if (!main) {
      const msg = new Text({
        text: 'No ticket selected.',
        style: new TextStyle({
          fill: 0xe6f1ff,
          fontSize: 30,
          fontWeight: '600',
        }),
      });
      msg.anchor.set(0.5);
      msg.position.set(DESIGN_W / 2, DESIGN_H / 2);
      this.ticketArea.addChild(msg);
      return;
    }

    const tier = getTiers().find((t) => t.id === main.item.tierId) as any;
    if (!tier) return;

    // build each board container
    for (let i = 0; i < this.linked.length; i++) {
      const link = this.linked[i];

      // per-ticket backstop
      this.applyBackstopIfReady(link.ticket, tier);

      const host = new Container();
      // logical (unscaled) x is updated in layout(); set a provisional spacing
      host.x = i * (DESIGN_W + 24);
      host.y = 0;
      this.ticketArea.addChild(host);

      const board = await this.buildOneBoard(
        host,
        link.item,
        link.ticket,
        tier
      );
      this.boards.push(board);
    }

    // Holo/foil overlay only in single-board mode to keep perf & layering simple
    if (this.boards.length === 1) {
      await this.installFoilOrHolo(this.boards[0].tier);
    }

    // Union of holes for CSS overlay
    this.emitOverlayHoles();

    // shared “Claim All” button
    this.claimBtn.onclick = () => this.claimIfDone();
    this.updateClaimButton();

    if (this.lastViewW && this.lastViewH)
      this.layout(this.lastViewW, this.lastViewH);
  }

  // Build one ticket board into a given host container
  private async buildOneBoard(
    host: any,
    item: any,
    ticket: any,
    tier: any
  ): Promise<Board> {
    const visuals = await ensureTierVisuals(tier);
    const ACCENT = hexToNum(tier.visual?.accentHex);

    // Background
    if (visuals.bg) {
      const bg = new Sprite(visuals.bg);
      bg.x = 0;
      bg.y = 0;
      bg.width = DESIGN_W;
      bg.height = DESIGN_H;
      const bgMask = new Graphics()
        .roundRect(0, 0, DESIGN_W, DESIGN_H, 20)
        .fill(0xffffff);
      host.addChild(bg, bgMask);
      bg.mask = bgMask;
      if (this.boards.length === 0) this.bgSprite = bg; // allow parallax in single-board
    }

    // Borders
    const borderInner = new Graphics()
      .roundRect(6, 6, DESIGN_W - 12, DESIGN_H - 12, 16)
      .stroke({ color: 0x2a3242, width: 3, alpha: 0.9 });
    const borderAccent = new Graphics()
      .roundRect(0, 0, DESIGN_W, DESIGN_H, 20)
      .stroke({ color: ACCENT, width: 2, alpha: 0.35 });
    host.addChild(borderAccent, borderInner);

    // ---------- FONT FAMILY (fix) ----------
    // visuals.fontName is a concrete loaded family (e.g., "TicketFont_t01") if present.
    // Otherwise use tier.visual.font as a family name, not a list; quote only if needed.
    const rawFamily =
      (visuals.fontName as string | undefined) ||
      (tier.visual?.font as string | undefined) ||
      '';

    const primaryFamily = rawFamily
      ? rawFamily
          .split(',')[0]
          .trim()
          .replace(/^['"]|['"]$/g, '')
      : '';

    const useFamily = primaryFamily
      ? `${
          /\s/.test(primaryFamily) ? `"${primaryFamily}"` : primaryFamily
        }, system-ui, Segoe UI, Roboto, sans-serif`
      : 'system-ui, Segoe UI, Roboto, sans-serif';
    // --------------------------------------

    // Title
    const TITLE_TOP = 18;
    const TITLE_SIZE = 70;
    const TITLE_BAR_GAP = 23;
    const title = new Text({
      text: tier.name,
      style: new TextStyle({
        fill: 0,
        fontFamily: useFamily,
        fontWeight: '600',
        fontSize: TITLE_SIZE,
        stroke: { width: 4, color: ACCENT, join: 'round' },
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(Math.round(DESIGN_W / 2), TITLE_TOP);
    host.addChild(title);

    // Winning numbers bar
    const BAR_TOP = TITLE_TOP + TITLE_SIZE + TITLE_BAR_GAP;
    const BAR_H = 74;
    const bar = new Graphics()
      .roundRect(24, BAR_TOP, DESIGN_W - 48, BAR_H, 12)
      .fill(0x0f1723)
      .stroke({ color: ACCENT, width: 2, alpha: 0.9 });
    host.addChild(bar);

    const wins: number[] = ticket.winning;
    const span = (DESIGN_W - 48) / wins.length;
    const centerY = Math.round(BAR_TOP + BAR_H / 2);

    wins.forEach((n: number, i: number) => {
      const t = new Text({
        text: String(n),
        style: new TextStyle({
          fill: 0xe6f1ff,
          fontFamily: useFamily,
          fontWeight: '600',
          fontSize: 32,
          stroke: { width: 4, color: 0x0b0e13 },
        }),
      });
      t.anchor.set(0.5);
      t.position.set(Math.round(24 + span * i + span / 2), centerY);
      host.addChild(t);

      if (i < wins.length - 1) {
        const sepX = 24 + span * (i + 1);
        const sepTop = Math.round(BAR_TOP + 6);
        const sepBot = Math.round(BAR_TOP + BAR_H - 6);
        const sep = new Graphics()
          .moveTo(sepX, sepTop)
          .lineTo(sepX, sepBot)
          .stroke({ color: 0x334155, width: 2, alpha: 0.8 });
        host.addChild(sep);
      }
    });

    // progress text
    const progressText = new Text({
      text: '',
      style: new TextStyle({ fill: 0xbfd2ff, fontSize: 14, fontWeight: '600' }),
    });
    progressText.visible = false;
    progressText.position.set(DESIGN_W - 140, TITLE_TOP + 2);
    host.addChild(progressText);

    const HEADER_BOTTOM = Math.round(BAR_TOP + BAR_H + 12);

    // GRID
    const cols = tier.mechanics.grid?.[0] || 4;
    const rows = tier.mechanics.grid?.[1] || 3;

    const pad = 14;
    const gridW = DESIGN_W - 48;

    const gridScale = Math.max(
      0.75,
      Math.min(1.15, Number(tier.visual?.gridScale) || 1)
    );

    const baseCell = (gridW - pad * (cols - 1)) / cols;
    const w = Math.round(baseCell * gridScale);
    const h = w;

    const totalGridWidth = w * cols + pad * (cols - 1);
    const left = Math.round(24 + (gridW - totalGridWidth) / 2);

    const CLAIM_H = 48;
    const SERIAL_H = 34;
    const FOOTER_RESERVE = 24 + CLAIM_H + 10 + SERIAL_H + 24;

    const gridHeight = rows * h + (rows - 1) * pad;
    const freeBand = DESIGN_H - HEADER_BOTTOM - FOOTER_RESERVE;
    const centeredTop = Math.round(
      HEADER_BOTTOM + Math.max(0, (freeBand - gridHeight) / 2)
    );

    const gridYOffset = Math.round(Number(tier.visual?.gridYOffset) || 0);
    const top = Math.max(HEADER_BOTTOM, centeredTop + gridYOffset);

    const boardIndex = this.boards.length; // index this board will take
    const cells: Cell[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const x = Math.round(left + c * (w + pad));
        const y = Math.round(top + r * (h + pad));
        const tile = ticket.tiles[idx];

        const gBG = new Graphics()
          .roundRect(0, 0, w, h, 16)
          .stroke({ color: ACCENT, width: 2, alpha: 0.9 });
        gBG.visible = !!tile.revealed;

        const numLabel = new Text({
          text: String(tile.num),
          style: new TextStyle({
            fill: 0xd6e3ff,
            align: 'center',
            fontSize: 26,
            fontFamily: useFamily,
          }),
        });
        numLabel.anchor.set(0.5);
        numLabel.position.set(Math.round(w / 2), Math.round(h / 2 - 14));
        numLabel.visible = !!tile.revealed;

        const prizeLabel = new Text({
          text: `$${tile.prize}`,
          style: new TextStyle({
            fill: 0xbfd2ff,
            align: 'center',
            fontSize: 18,
            fontWeight: '600',
            fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          }),
        });
        prizeLabel.anchor.set(0.5);
        prizeLabel.position.set(Math.round(w / 2), Math.round(h / 2 + 12));
        prizeLabel.visible = !!tile.revealed;

        const cont = new Container();
        cont.position.set(x, y);
        cont.addChild(gBG, numLabel, prizeLabel);

        // cover + mask
        const coverMask = new Graphics()
          .roundRect(0, 0, w, h, 16)
          .fill(0xffffff);
        const coverSprite = visuals.cover
          ? Object.assign(new Sprite(visuals.cover), {
              x: 0,
              y: 0,
              width: w,
              height: h,
            })
          : new Graphics().roundRect(0, 0, w, h, 16).fill(0x1f2937);
        coverSprite.alpha = tile.revealed ? 0 : 1;
        cont.addChild(coverMask, coverSprite);
        coverSprite.mask = coverMask;

        // hit
        const hit = new Graphics().roundRect(0, 0, w, h, 16).fill(0xffffff);
        hit.alpha = 0.001;
        hit.eventMode = 'static';
        hit.cursor = 'pointer';
        hit.on('pointertap', () => this.revealAt(boardIndex, idx));
        hit.on('pointerdown', () => this.revealAt(boardIndex, idx));
        cont.addChild(hit);

        host.addChild(cont);

        const cell: Cell = {
          container: cont,
          numText: numLabel,
          prizeText: prizeLabel,
          hit,
          cover: coverSprite,
          rect: { x, y, w, h },
          index: idx,
          isWin: !!tile.win,
          bg: gBG,
          revealed: !!tile.revealed,
        };
        cells.push(cell);

        if (tile.revealed) {
          const isWin = (ticket.winning as number[]).includes(tile.num);
          this.styleCell(cell, isWin, ACCENT);
        }
      }
    }

    // Serial badge
    if (item?.serialId) {
      const badgeW = 182;
      const badgeH = 34;
      const bx = 24;
      const by = DESIGN_H - 24 - badgeH;

      const serialBg = new Graphics()
        .roundRect(0, 0, badgeW, badgeH, 8)
        .fill(0xffffff)
        .stroke({ color: 0x0b0e13, width: 2, alpha: 0.85 });

      const serialTxt = new Text({
        text: item.serialId,
        style: new TextStyle({
          fill: 0x0b0e13,
          fontSize: 17,
          fontWeight: '600',
          fontFamily: 'Segoe UI',
          letterSpacing: 0.5,
        }),
      });
      serialTxt.anchor.set(0.5);
      serialTxt.position.set(Math.round(badgeW / 2), Math.round(badgeH / 2));

      const wrap = new Container();
      wrap.position.set(Math.round(bx), Math.round(by));
      wrap.addChild(serialBg, serialTxt);
      host.addChild(wrap);
    }

    // Optional bonus box
    const lastCell = cells[cells.length - 1];
    const gridBottom = (lastCell ? lastCell.rect.y + lastCell.rect.h : 0) + 14;
    let nextY = gridBottom;
    const bb = this.setupBonusBox(
      {
        item,
        ticket,
        tier,
        container: host,
        cells,
        cols,
        rows,
        claimRect: null,
        progressText,
        bonus: {},
      } as Board,
      nextY
    );
    nextY = bb?.yAfter ?? nextY;

    // Set crest (lower-right)
    const crestW = 160;
    const crestH = 34;
    const cx = DESIGN_W - 24 - crestW;
    const cy = DESIGN_H - 24 - crestH;
    const crest = new Container();
    crest.position.set(Math.round(cx), Math.round(cy));

    const crestBg = new Graphics()
      .roundRect(0, 0, crestW, crestH, 8)
      .fill(0x0f1723)
      .stroke({ color: ACCENT, width: 2, alpha: 0.9 });

    const crestLabel = new Text({
      text: `${(tier.set || 'Set').toUpperCase()} SET`,
      style: new TextStyle({
        fill: 0xe6f1ff,
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 1,
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
      }),
    });
    crestLabel.anchor.set(0, 0.5);
    crestLabel.position.set(12, Math.round(crestH / 2));

    const isHolo = !!tier.visual?.holo || !!tier.visual?.holoOverlay;
    const isGold = tier.visual?.foil === 'gold' || !!tier.visual?.foilOverlay;
    const chipColor = isHolo ? 0x60a5fa : isGold ? 0xfacc15 : 0x64748b;

    const chip = new Graphics()
      .roundRect(0, 0, 22, 14, 7)
      .fill(chipColor)
      .stroke({ color: 0x0b0e13, width: 2, alpha: 0.85 });
    chip.position.set(crestW - 12 - 22, Math.round(crestH / 2 - 7));

    const chipGlyph = new Text({
      text: isHolo ? 'H' : isGold ? 'G' : '•',
      style: new TextStyle({ fill: 0x0b0e13, fontWeight: '600', fontSize: 10 }),
    });
    chipGlyph.anchor.set(0.5);
    chipGlyph.position.set(chip.x + 11, Math.round(crestH / 2));

    crest.addChild(crestBg, crestLabel, chip, chipGlyph);
    host.addChild(crest);

    // Claim rect (per board; the shared button spans under the whole group)
    const firstCell = cells[0];
    const claimRect = {
      x: firstCell ? firstCell.rect.x : 24,
      y: nextY,
      w: DESIGN_W - 48,
      h: 48,
    };

    return {
      item,
      ticket,
      tier,
      container: host,
      cells,
      cols,
      rows,
      claimRect,
      progressText,
      bonus: ticket.bonus || {},
    };
  }

  private styleCell(cell: Cell, win: boolean, accent: number) {
    const { w, h } = cell.rect;
    const bg = cell.bg;
    bg.clear();
    bg.roundRect(0, 0, w, h, 16)
      .fill(win ? 0x133a2e : 0x151b26)
      .stroke({ color: win ? accent : 0x334155, width: win ? 5 : 3, alpha: 1 });
  }

  // Reveal logic (multi-board)
  private revealOneBoard(bi: number, idx: number) {
    const B = this.boards[bi];
    if (!B) return;
    const cell = B.cells[idx];
    if (!cell || cell.revealed) return;

    cell.revealed = true;
    const t = B.ticket.tiles[idx];
    t.revealed = true;

    if (!B.ticket.firstRevealAt) B.ticket.firstRevealAt = Date.now();

    const isWin = (B.ticket.winning as number[]).includes(t.num);
    cell.isWin = isWin;
    t.win = isWin;

    cell.numText.visible = true;
    cell.prizeText.visible = true;
    if (cell.cover) cell.cover.alpha = 0;
    cell.bg.visible = true;

    incTilesScratched(1);

    this.styleCell(cell, isWin, hexToNum(B.tier?.visual?.accentHex));

    if (B.item.state === 'sealed') B.item.state = 'scratched';

    saveNow();
  }

  private revealAt(bi: number, idx: number) {
    const B = this.boards[bi];
    if (!B) return;

    const mode = getScratchMode();
    const indices = new Set<number>();
    const c = B.cols,
      r = B.rows;
    const row = Math.floor(idx / c),
      col = idx % c;
    const pushIf = (i: number) => {
      if (i >= 0 && i < B.cells.length) indices.add(i);
    };

    if (mode === 'all') {
      for (let i = 0; i < B.cells.length; i++) indices.add(i);
    } else if (mode === 'square3') {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = row + dr,
            cc = col + dc;
          if (rr >= 0 && rr < r && cc >= 0 && cc < c) pushIf(rr * c + cc);
        }
    } else if (mode === 'cross') {
      pushIf(idx);
      if (col - 1 >= 0) pushIf(idx - 1);
      if (col + 1 < c) pushIf(idx + 1);
      if (row - 1 >= 0) pushIf(idx - c);
      if (row + 1 < r) pushIf(idx + c);
    } else {
      pushIf(idx);
    }

    for (const i of indices) this.revealOneBoard(bi, i);
    this.updateClaimButton();
    this.emitOverlayHoles();
  }

  // Overlay holes across all boards (for CSS fx overlay)
  private emitOverlayHoles() {
    const holes = this.boards.flatMap((B) =>
      B.cells.map((c) => ({
        x: B.container.x + c.rect.x,
        y: B.container.y + c.rect.y,
        w: c.rect.w,
        h: c.rect.h,
        r: 16,
      }))
    );
    window.dispatchEvent(
      new CustomEvent('fx:set-holes', { detail: { holes } })
    );
  }

  private hideClaim() {
    this.claimBtn.classList.remove('show');
    this.claimBtn.style.display = 'none';
  }
  private showClaim() {
    this.claimBtn.classList.add('show');
    this.claimBtn.style.display = 'inline-block';
  }

  // Enable button only when all boards are fully revealed
  private updateClaimButton() {
    const allDone =
      this.boards.length > 0 &&
      this.boards.every((B) => B.cells.every((c) => c.revealed));

    if (allDone) {
      this.showClaim();
      this.positionClaimButton();
    } else {
      this.hideClaim();
    }
  }

  // Position one shared “Claim All” button centered under the whole group
  private positionClaimButton() {
    if (!this.boards.length) return;

    const scale = this.ticketArea.scale?.x ?? 1;
    const baseX = this.ticketArea.x ?? 0;
    const baseY = this.ticketArea.y ?? 0;

    const leftMost = this.boards[0].container.x;
    const rightMost =
      this.boards[this.boards.length - 1].container.x + DESIGN_W;
    const groupW = rightMost - leftMost;

    const yBelow = Math.max(
      ...this.boards.map((B) => B.claimRect?.y || DESIGN_H - 72)
    );

    const M = 18; // <— breathing-room (px in unscaled coords)

    const pxLeft = Math.round(baseX + (leftMost + M) * scale);
    const pxTop = Math.round(baseY + yBelow * scale);
    const pxW = Math.round((groupW - 2 * M) * scale);
    const pxH = Math.round(48 * scale);

    const s = this.claimBtn.style;
    s.left = `${pxLeft}px`;
    s.top = `${pxTop}px`;
    s.width = `${pxW}px`;
    s.height = `${pxH}px`;
    s.borderRadius = `${Math.max(8, Math.floor(12 * scale))}px`;
    s.fontSize = `${Math.max(12, Math.floor(16 * scale))}px`;
  }

  // Claim ALL boards together (writes per-ticket summaries used by Inventory modal)
  private async claimIfDone() {
    if (!this.boards.length) return;
    const allDone = this.boards.every((B) => B.cells.every((c) => c.revealed));
    if (!allDone) return;

    const upgMult = getPrizeMultiplier();
    const streakMult = getStreakFactor();

    let grandTotal = 0;
    let totalBonus = 0;

    // process each board
    for (const B of this.boards) {
      const winningNums: number[] = Array.isArray(B.ticket.winning)
        ? B.ticket.winning
        : [];
      const baseTiles = B.ticket.tiles.reduce(
        (sum: number, t: any) =>
          sum + (winningNums.includes(t.num) ? t.prize || 0 : 0),
        0
      );
      const tilesPayout = Math.floor(baseTiles * upgMult * streakMult);
      const bonusAmt =
        B.ticket?.bonus?.revealed && B.ticket?.bonus
          ? B.ticket.bonus.amount || 0
          : 0;
      const payout = tilesPayout + bonusAmt;

      // credit cash immediately
      if (payout > 0) {
        addCash(payout);
      }

      // stats / summary
      const startedAt = Number(B.ticket?.firstRevealAt) || Date.now();
      const clearMs = Math.max(0, Date.now() - startedAt);
      const wonTiles = B.ticket.tiles
        .filter((t: any) => winningNums.includes(t.num))
        .map((t: any) => Math.max(0, t.prize || 0));

      const price = B.tier?.price ?? 0;

      try {
        B.item.ticket = {
          payout,
          price,
          net: payout - price,
          bonus: bonusAmt,
          upgMult,
          streakMult,
          winning: [...winningNums],
          claimedAt: Date.now(),
        };
      } catch {}

      // onTicketClaimed (support old/new signatures)
      try {
        const { onTicketClaimed } = await import('../core/state.js');
        if ((onTicketClaimed as any).length >= 3) {
          (onTicketClaimed as any)(B.item.tierId, payout, {
            clearMs,
            tilePrizes: wonTiles,
            priceOverride: price,
          });
        } else {
          (onTicketClaimed as any)(B.item.tierId, payout);
        }
      } catch {}

      B.item.state = 'claimed';
      grandTotal += payout;
      totalBonus += bonusAmt;
    }

    // save & refresh money/tokens pills
    saveNow();
    if (this.moneyEl)
      this.moneyEl.textContent = `$${state.money.toLocaleString()}`;
    const tokensEl = document.getElementById(
      'tokens'
    ) as HTMLSpanElement | null;
    if (tokensEl) tokensEl.textContent = String(state.tokens);

    // Toast (aggregate)
    const multParts: string[] = [];
    if (upgMult > 1) multParts.push(`x${upgMult.toFixed(2)} upgrades`);
    if (streakMult > 1) multParts.push(`x${streakMult.toFixed(2)} streak`);
    const extras = multParts.length ? ` — ${multParts.join(' + ')}` : '';
    const bonusText = totalBonus > 0 ? ` + $${totalBonus} bonus` : '';
    toast(`Claimed $${grandTotal}${bonusText}${extras}`, 'success');

    if (state.flags?.autoReturn) {
      setCurrentItem(null);

      // Jump scenes directly (no DOM click)
      const scenes = (window as any).__SCENES__;
      if (scenes?.goto) scenes.goto('Inventory');

      // Sync DOM panels with the new scene (uses your main.ts helper)
      const setUI = (window as any).__SET_SCENE_UI__;
      if (typeof setUI === 'function') setUI('Inventory');
    }

    this.hideClaim();
  }

  public layout(viewW: number, viewH: number) {
    this.lastViewW = viewW;
    this.lastViewH = viewH;

    // Cast to HTMLElement so offsetHeight is available
    const topbar = document.querySelector('.topbar') as HTMLElement | null;
    const navbar = document.querySelector('.navbar') as HTMLElement | null;

    const topPad = (topbar?.offsetHeight ?? 0) + EXTRA_TOP;
    const bottomPad = (navbar?.offsetHeight ?? 0) + EXTRA_BOTTOM;

    const usableW = Math.max(100, viewW);
    const usableH = Math.max(100, viewH - topPad - bottomPad);

    const n = Math.max(1, this.boards.length);
    const gutter = 24;
    const groupW = n * DESIGN_W + (n - 1) * gutter;

    const maxW = Math.floor(usableW * MAX_WIDTH_FRAC);
    const maxH = Math.floor(usableH * MAX_HEIGHT_FRAC);

    const fitScale = Math.min(maxW / groupW, maxH / DESIGN_H);
    const scale = Math.max(0.2, fitScale * USER_SCALE);

    this.ticketArea.scale.set(scale);

    const totalW = groupW * scale;
    const totalH = DESIGN_H * scale;

    const x = Math.round((viewW - totalW) / 2);
    const y = Math.round((viewH - bottomPad - topPad - totalH) / 2 + topPad);

    this.ticketArea.position.set(x, y);

    // Re-position logical containers (unscaled space)
    for (let i = 0; i < this.boards.length; i++) {
      this.boards[i].container.x = i * (DESIGN_W + gutter);
      this.boards[i].container.y = 0;
    }

    this.positionClaimButton();
    this.emitOverlayHoles();

    (this as any).hitArea = new Rectangle(0, 0, viewW, viewH);
  }

  // ===== Optional Foil/Holo + Parallax (single-board only) =====
  private getParallaxStrength(tier: any): number {
    const p = Math.max(1, tier.price || 1);
    return Math.min(4, 1 + Math.log2(p) * 0.1);
  }

  private async installFoilOrHolo(tier: any) {
    // cleanup previous overlay
    this.fxOverlay?.destroy?.();
    this.fxOverlay = null;
    this.ticketArea.off('globalpointermove', this.onPointerMove);

    const v = tier?.visual || {};
    const hasHolo = v.holo === true || !!v.holoOverlay;
    const hasFoil = v.foil === 'gold' || !!v.foilOverlay;

    let url: string | null = null;
    let kind: 'holo' | 'foil' | null = null;
    if (hasHolo && v.holoOverlay) {
      url = v.holoOverlay;
      kind = 'holo';
    } else if (hasFoil && v.foilOverlay) {
      url = v.foilOverlay;
      kind = 'foil';
    }

    if (!url || !kind) return;

    const alphaDefault = kind === 'holo' ? 0.28 : 0.26;
    const alpha =
      (kind === 'holo'
        ? v.holoAlpha ?? v.overlayAlpha
        : v.foilAlpha ?? v.overlayAlpha) ?? alphaDefault;

    const baseOpts: any = {
      alpha,
      radius: 20,
      bloom: v.overlayBloom ?? true,
      bloomStrength: v.overlayBloomStrength ?? (kind === 'holo' ? 1.2 : 1.1),
      bloomLevels: v.overlayBloomLevels ?? 1,
    };

    const helper =
      kind === 'holo'
        ? new (await import('../effects/HoloFoilFilter.js')).default(url, {
            ...baseOpts,
            sweep: v.overlaySweep ?? true,
            sweepWidth: v.overlaySweepWidth ?? 160,
            sweepSpeed: v.overlaySweepSpeed ?? 48,
            sweepInterval: v.overlaySweepInterval ?? 8.0,
            sweepAlpha: v.overlaySweepAlpha ?? 0.22,
            sweepTiltDeg: v.overlaySweepTilt ?? -16,
            edgeGlow: v.edgeGlow ?? true,
            edgeGlowColor: v.accentHex
              ? parseInt(String(v.accentHex).replace('#', ''), 16)
              : 0xffffff,
            edgeGlowStrength: v.edgeGlowStrength ?? 0.35,
            edgeGlowSpeed: v.edgeGlowSpeed ?? 0.6,
          })
        : new (await import('../effects/GoldFoilFilter.js')).default(url, {
            ...baseOpts,
            sparkles: v.overlaySparkles ?? true,
            sparkleRate: v.overlaySparkleRate ?? 0.1,
            sparkleMin: v.overlaySparkleMin ?? 6,
            sparkleMax: v.overlaySparkleMax ?? 14,
            sparkleAlpha: v.overlaySparkleAlpha ?? 0.18,
          });

    this.fxOverlay = helper;
    await helper.install(this.ticketArea, DESIGN_W, DESIGN_H);

    try {
      const spr: any = this.fxOverlay?.sprite;
      if (spr) {
        spr.eventMode = 'none';
        const ta: any = this.ticketArea;
        if (this.bgSprite && ta?.getChildIndex && ta?.setChildIndex) {
          const bgIdx = ta.getChildIndex(this.bgSprite);
          ta.setChildIndex(spr, Math.min(bgIdx + 1, ta.children.length - 1));
        }
      }
    } catch {}

    const p = v.overlayParallax;
    this.parallaxStrength =
      typeof p === 'number' ? p : this.getParallaxStrength(tier);

    this.ticketArea.on('globalpointermove', this.onPointerMove);
  }

  private onPointerMove = (e: any) => {
    if (this.boards.length !== 1) return; // parallax only in single-board mode
    const local = this.ticketArea.toLocal(e.global);
    let nx = (local.x / DESIGN_W) * 2 - 1;
    let ny = (local.y / DESIGN_H) * 2 - 1;
    nx = Math.max(-1, Math.min(1, nx));
    ny = Math.max(-1, Math.min(1, ny));

    if (this.fxOverlay?.updateParallax) {
      this.fxOverlay.updateParallax(nx, ny, this.parallaxStrength);
    }
    if (this.bgSprite) {
      this.bgSprite.x = -nx * (this.parallaxStrength * 0.5);
      this.bgSprite.y = -ny * (this.parallaxStrength * 0.5);
    }
  };
}
