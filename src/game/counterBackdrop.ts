import { getDrinkStationLayout, type DrinkStationLayout } from "./drinkAssembly";
import { FRESH_PRESSED_MENU, HOUSE_MIXES_MENU } from "./model";

const INK = "#321432";
const CREAM = "#f3dfbd";
const CORAL = "#ed5a50";
const MINT = "#66d9c0";
const GOLD = "#ffc84c";

export type MenuBoardRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  border: number;
  accent: string;
  label: string;
};

export type CounterBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CounterSceneLayout = {
  width: number;
  height: number;
  isNarrow: boolean;
  isCompactPhone: boolean;
  wallBottom: number;
  railY: number;
  backPanelBox: CounterBox | null;
  leftMenu: MenuBoardRect;
  rightMenu: MenuBoardRect;
  prepMat: CounterBox;
  cuttingBoard: CounterBox | null;
  juicerPress: CounterBox | null;
  fruitCrate: CounterBox | null;
  cupStackRight: { x: number; baseY: number } | null;
};

type CachedStaticScene = {
  key: string;
  canvas: HTMLCanvasElement;
  layout: CounterSceneLayout;
};

type CachedComposedScene = {
  key: string;
  canvas: HTMLCanvasElement;
};

let staticCache: CachedStaticScene | null = null;
let composedCache: CachedComposedScene | null = null;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

export function getCounterSceneLayout(
  width: number,
  height: number,
  station: DrinkStationLayout = getDrinkStationLayout(width, height),
): CounterSceneLayout {
  const isNarrow = width < 760;
  const isCompactPhone = width < 370;
  const wallBottom = height * 0.72;
  const isShortLandscape = height < 560;
  const railY = isShortLandscape
    ? Math.max(94, Math.min(196, height * 0.245))
    : Math.max(196, height * 0.245);
  const dadoHeight = Math.max(28, Math.min(64, height * 0.068));
  const dadoTop = wallBottom - dadoHeight;

  const panelMargin = Math.max(122, Math.min(238, width * 0.19));
  const panelX = panelMargin;
  const panelY = railY + 24;
  const panelWidth = Math.max(180, width - panelMargin * 2);
  const panelHeight = Math.max(0, dadoTop - panelY - 8);
  const backPanelBox: CounterBox | null =
    panelWidth > 250 && panelHeight > 54
      ? {
          left: panelX,
          right: panelX + panelWidth,
          top: panelY,
          bottom: panelY + panelHeight,
        }
      : null;

  const menuWidth = Math.max(116, Math.min(184, width * 0.145));
  const menuHeight = Math.max(isShortLandscape ? 82 : 98, menuWidth * 0.62);
  const maxMenuY = Math.max(railY + 20, wallBottom - menuHeight - 12);
  const menuY = isShortLandscape
    ? Math.min(maxMenuY, Math.max(railY + 20, height * 0.32))
    : Math.max(274, height * 0.345);
  const menuBorder = Math.max(5, menuWidth * 0.04);
  const menuMargin = Math.max(18, width * 0.055);

  const leftMenu: MenuBoardRect = {
    x: menuMargin,
    y: menuY,
    width: menuWidth,
    height: menuHeight,
    border: menuBorder,
    accent: MINT,
    label: "FRESH PRESSED",
  };

  const rightMenu: MenuBoardRect = {
    x: width - menuMargin - menuWidth,
    y: menuY,
    width: menuWidth,
    height: menuHeight,
    border: menuBorder,
    accent: GOLD,
    label: "HOUSE MIXES",
  };

  const cupRight = station.x + station.topWidth * 0.5;
  const prepMatLeft = isNarrow ? 4 : 12;
  const prepMatRight = Math.min(width - 8, cupRight + (isNarrow ? 12 : 26));
  const prepMat: CounterBox = {
    left: prepMatLeft,
    right: Math.max(prepMatLeft + 60, prepMatRight),
    top: wallBottom + 20,
    bottom: Math.min(height - 6, station.baseY + 18),
  };

  const counterH = Math.max(40, height - wallBottom);

  let cuttingBoard: CounterBox | null = null;
  let juicerPress: CounterBox | null = null;
  let fruitCrate: CounterBox | null = null;
  let cupStackRight: { x: number; baseY: number } | null = null;

  if (!isNarrow) {
    // Wide desktop/tablet: clear separation between left station, center control hint, and right prep tools.
    const boardW = Math.min(238, Math.max(146, width * 0.17));
    const boardLeft = Math.max(prepMat.right + 66, width * 0.45);
    const boardTop = wallBottom + Math.max(36, counterH * 0.18);
    const boardBottom = Math.min(height - 14, wallBottom + counterH * 0.88);
    if (boardLeft + boardW < width - 230 && boardBottom - boardTop >= 44) {
      cuttingBoard = {
        left: boardLeft,
        right: boardLeft + boardW,
        top: boardTop,
        bottom: boardBottom,
      };
    }

    const crateW = Math.min(148, Math.max(102, width * 0.11));
    const crateLeft = Math.max(
      (cuttingBoard ? cuttingBoard.right : prepMat.right) + 18,
      width * 0.655,
    );
    const crateRight = Math.min(width - 185, crateLeft + crateW);
    if (crateRight - crateLeft >= 82) {
      fruitCrate = {
        left: crateLeft,
        right: crateRight,
        top: wallBottom - Math.min(28, height * 0.03),
        bottom: wallBottom + Math.min(82, counterH * 0.44),
      };
    }

    const juicerW = Math.min(114, Math.max(84, width * 0.084));
    const juicerRight = width - Math.max(78, width * 0.058);
    const juicerLeft = Math.max(
      (fruitCrate ? fruitCrate.right : prepMat.right) + 14,
      juicerRight - juicerW,
    );
    const juicerBottom = Math.min(height - 14, wallBottom + counterH * 0.8);
    const juicerH = Math.min(194, Math.max(76, height * 0.22));
    const juicerTop = Math.max(rightMenu.y + rightMenu.height + 8, juicerBottom - juicerH);
    if (juicerBottom - juicerTop >= 60) {
      juicerPress = {
        left: juicerLeft,
        right: juicerLeft + juicerW,
        top: juicerTop,
        bottom: juicerBottom,
      };
    }

    if (juicerPress) {
      const stackX = Math.min(width - 28, juicerPress.right + 28);
      if (stackX - juicerPress.right >= 18 && width - stackX >= 22) {
        cupStackRight = { x: stackX, baseY: juicerPress.bottom - 2 };
      }
    }
  } else if (!isCompactPhone) {
    // 370-759px phones: cup ends around x <= 305 on 390px. Tuck compact prep gear cleanly on the far right.
    const freeLeft = Math.max(prepMat.right + 6, width - 86);
    if (width - freeLeft >= 58) {
      const boardTop = wallBottom + Math.max(54, counterH * 0.34);
      const boardHeight = Math.min(68, Math.max(46, counterH * 0.32));
      cuttingBoard = {
        left: freeLeft,
        right: width - 8,
        top: boardTop,
        bottom: Math.min(height - 14, boardTop + boardHeight),
      };
      juicerPress = {
        left: freeLeft + 6,
        right: width - 10,
        top: Math.max(rightMenu.y + rightMenu.height + 18, wallBottom - 56),
        bottom: wallBottom + Math.min(44, counterH * 0.24),
      };
    }
  } else {
    // Ultra-narrow <= 369px (e.g. 320px): keep bottom counter clear beside the cup; put a mini crate on the right upper shelf.
    fruitCrate = {
      left: width - 92,
      right: width - 48,
      top: railY - 34,
      bottom: railY - 3,
    };
  }

  return {
    width,
    height,
    isNarrow,
    isCompactPhone,
    wallBottom,
    railY,
    backPanelBox,
    leftMenu,
    rightMenu,
    prepMat,
    cuttingBoard,
    juicerPress,
    fruitCrate,
    cupStackRight,
  };
}

function drawDinerSpark(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 1,
) {
  context.save();
  context.translate(x, y);
  context.globalAlpha = alpha;
  context.strokeStyle = INK;
  context.fillStyle = color;
  context.lineWidth = Math.max(2, radius * 0.13);
  context.lineJoin = "round";
  context.beginPath();
  for (let point = 0; point < 16; point += 1) {
    const angle = -Math.PI / 2 + (point / 16) * Math.PI * 2;
    const pointRadius = point % 2 === 0 ? radius : radius * 0.34;
    const pointX = Math.cos(angle) * pointRadius;
    const pointY = Math.sin(angle) * pointRadius;
    if (point === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawMenuBoardFrame(context: CanvasRenderingContext2D, board: MenuBoardRect) {
  const { x, y, width, height, border, accent, label } = board;
  context.save();

  context.fillStyle = "rgba(22,8,29,.34)";
  roundedRect(context, x + 7, y + 9, width, height, 13);
  context.fill();

  context.fillStyle = INK;
  roundedRect(context, x, y, width, height, 13);
  context.fill();

  context.fillStyle = CREAM;
  roundedRect(context, x + 3, y + 3, width - 6, height - 6, 10);
  context.fill();

  context.fillStyle = "#182c33";
  roundedRect(context, x + border, y + border, width - border * 2, height - border * 2, 7);
  context.fill();

  context.strokeStyle = accent;
  context.globalAlpha = 0.5;
  context.lineWidth = 2;
  roundedRect(context, x + border + 3, y + border + 3, width - border * 2 - 6, height - border * 2 - 6, 5);
  context.stroke();
  context.globalAlpha = 1;

  const cupX = x + border + 15;
  const cupY = y + border + 18;
  context.strokeStyle = INK;
  context.fillStyle = accent;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(cupX - 7, cupY - 7);
  context.lineTo(cupX + 7, cupY - 7);
  context.lineTo(cupX + 5, cupY + 8);
  context.quadraticCurveTo(cupX, cupY + 12, cupX - 5, cupY + 8);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(cupX + 1, cupY - 8);
  context.lineTo(cupX + 7, cupY - 18);
  context.strokeStyle = CREAM;
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = accent;
  context.font = `950 ${Math.max(10, width * 0.078)}px "Arial Rounded MT Bold", system-ui`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(label, cupX + 16, cupY - 1, width - border * 2 - 44);

  context.strokeStyle = "rgba(243,223,189,.22)";
  context.lineCap = "round";
  context.lineWidth = 1.5;
  const rowStart = y + height * 0.46;
  const rowGap = Math.max(14, height * 0.15);
  for (let row = 0; row < 3; row += 1) {
    const lineY = rowStart + row * rowGap;
    context.beginPath();
    context.moveTo(x + border + 10, lineY + 6);
    context.lineTo(x + width - border - 10, lineY + 6);
    context.stroke();
  }

  drawDinerSpark(context, x + width - 11, y + 12, Math.max(7, width * 0.052), accent, 0.9);
  context.restore();
}

function drawMenuBoardLines(
  context: CanvasRenderingContext2D,
  board: MenuBoardRect,
  lines: readonly string[],
) {
  const { x, y, width, height, border, accent } = board;
  const rowStart = y + height * 0.46;
  const rowGap = Math.max(14, height * 0.15);
  context.save();
  for (let row = 0; row < 3; row += 1) {
    const drink = lines[row];
    if (!drink) continue;
    const lineY = rowStart + row * rowGap;
    context.fillStyle = CREAM;
    context.font = `800 ${Math.max(9, width * 0.072)}px "Arial Rounded MT Bold", system-ui`;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText(drink, x + border + 12, lineY + 2, width - border * 2 - 28);
    context.fillStyle = accent;
    context.beginPath();
    context.arc(x + width - border - 11, lineY, 2.2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawCupStack(
  context: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  cupWidth: number,
  cupHeight: number,
  count: number,
  inverted: boolean,
  accent: string,
) {
  context.save();
  const stepY = Math.max(5, cupHeight * 0.24);
  for (let i = 0; i < count; i += 1) {
    const y = baseY - i * stepY;
    const topW = inverted ? cupWidth * 0.72 : cupWidth;
    const botW = inverted ? cupWidth : cupWidth * 0.72;
    const bodyFill = i === count - 1 ? accent : i % 2 === 0 ? "#e8d2ad" : "#d8ece6";

    context.fillStyle = bodyFill;
    context.strokeStyle = INK;
    context.lineWidth = 2.6;
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(x - topW * 0.5, y - cupHeight);
    context.lineTo(x + topW * 0.5, y - cupHeight);
    context.lineTo(x + botW * 0.5, y);
    context.lineTo(x - botW * 0.5, y);
    context.closePath();
    context.fill();
    context.stroke();

    const rimY = inverted ? y : y - cupHeight;
    const rimW = (inverted ? botW : topW) + 4;
    context.fillStyle = CREAM;
    roundedRect(context, x - rimW * 0.5, rimY - 3, rimW, 6, 3);
    context.fill();
    context.stroke();

    context.fillStyle = "rgba(255,255,255,0.28)";
    context.fillRect(x - topW * 0.26, y - cupHeight + 4, Math.max(3, cupWidth * 0.14), cupHeight - 8);
  }
  context.restore();
}

function drawSyrupBottle(
  context: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  width: number,
  height: number,
  liquidColor: string,
  labelColor: string,
) {
  context.save();
  const neckW = width * 0.34;
  const shoulderY = baseY - height * 0.66;

  context.strokeStyle = INK;
  context.fillStyle = "#b8cbc5";
  context.lineWidth = 2.2;
  context.beginPath();
  context.moveTo(x - neckW * 0.3, baseY - height);
  context.lineTo(x + neckW * 0.25, baseY - height - 9);
  context.lineTo(x + neckW * 0.5, baseY - height - 7);
  context.lineTo(x + neckW * 0.3, baseY - height);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = liquidColor;
  context.strokeStyle = INK;
  context.lineWidth = 2.6;
  context.beginPath();
  context.moveTo(x - neckW * 0.5, baseY - height);
  context.lineTo(x + neckW * 0.5, baseY - height);
  context.lineTo(x + neckW * 0.55, baseY - height * 0.82);
  context.quadraticCurveTo(x + width * 0.5, shoulderY, x + width * 0.5, shoulderY + 6);
  context.lineTo(x + width * 0.5, baseY - 3);
  context.quadraticCurveTo(x + width * 0.5, baseY, x + width * 0.5 - 3, baseY);
  context.lineTo(x - width * 0.5 + 3, baseY);
  context.quadraticCurveTo(x - width * 0.5, baseY, x - width * 0.5, baseY - 3);
  context.lineTo(x - width * 0.5, shoulderY + 6);
  context.quadraticCurveTo(x - width * 0.5, shoulderY, x - neckW * 0.55, baseY - height * 0.82);
  context.closePath();
  context.fill();
  context.stroke();

  const labelH = height * 0.32;
  const labelY = baseY - height * 0.48;
  context.fillStyle = CREAM;
  roundedRect(context, x - width * 0.42, labelY, width * 0.84, labelH, 3);
  context.fill();
  context.stroke();
  context.fillStyle = labelColor;
  context.fillRect(x - width * 0.34, labelY + labelH * 0.34, width * 0.68, Math.max(3, labelH * 0.28));

  context.fillStyle = "rgba(255,255,255,0.34)";
  context.fillRect(x - width * 0.32, shoulderY + 4, Math.max(2.5, width * 0.14), height * 0.5);
  context.restore();
}

function drawShakerTin(context: CanvasRenderingContext2D, x: number, baseY: number, width: number, height: number) {
  context.save();
  const topW = width;
  const botW = width * 0.72;
  context.fillStyle = "#9ab6b0";
  context.strokeStyle = INK;
  context.lineWidth = 2.6;
  context.beginPath();
  context.moveTo(x - topW * 0.5, baseY - height);
  context.lineTo(x + topW * 0.5, baseY - height);
  context.lineTo(x + botW * 0.5, baseY);
  context.lineTo(x - botW * 0.5, baseY);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#cde0db";
  context.beginPath();
  context.moveTo(x - topW * 0.44, baseY - height);
  context.lineTo(x - topW * 0.22, baseY - height - 10);
  context.lineTo(x + topW * 0.22, baseY - height - 10);
  context.lineTo(x + topW * 0.44, baseY - height);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.35)";
  context.fillRect(x - topW * 0.26, baseY - height + 3, Math.max(3, width * 0.16), height - 6);
  context.restore();
}

function drawBackBarShelfProps(context: CanvasRenderingContext2D, layout: CounterSceneLayout) {
  const { width, railY, isNarrow, isCompactPhone } = layout;
  const shelfTopY = railY - 3;

  const bracketXs = [width * 0.12, width * 0.88];
  context.save();
  bracketXs.forEach((bx) => {
    context.fillStyle = "#527876";
    context.strokeStyle = INK;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(bx - 6, railY + 17);
    context.lineTo(bx + 6, railY + 17);
    context.lineTo(bx + 3, railY + 34);
    context.lineTo(bx - 3, railY + 34);
    context.closePath();
    context.fill();
    context.stroke();
  });
  context.restore();

  const leftStart = Math.max(20, width * 0.038);
  const cupW = isNarrow ? 22 : 28;
  const cupH = isNarrow ? 24 : 30;
  drawCupStack(context, leftStart + cupW * 0.5, shelfTopY, cupW, cupH, 3, true, "#57ccb5");

  if (!isCompactPhone) {
    drawSyrupBottle(context, leftStart + cupW + 24, shelfTopY, isNarrow ? 18 : 22, isNarrow ? 42 : 52, "#e04f58", CORAL);
    if (!isNarrow) {
      drawSyrupBottle(context, leftStart + cupW + 54, shelfTopY, 21, 46, "#eb9d2e", GOLD);
    }
  }

  const rightEnd = width - Math.max(20, width * 0.038);
  drawCupStack(context, rightEnd - cupW * 0.5, shelfTopY, cupW, cupH, 3, true, "#ee7a64");
  if (!isCompactPhone) {
    drawShakerTin(context, rightEnd - cupW - 26, shelfTopY, isNarrow ? 22 : 26, isNarrow ? 38 : 46);
    if (!isNarrow) {
      drawSyrupBottle(context, rightEnd - cupW - 58, shelfTopY, 20, 48, "#6dc968", MINT);
    }
  }
}

function drawPendantValanceShade(context: CanvasRenderingContext2D, x: number, topY: number, scale: number) {
  context.save();
  context.globalAlpha = 0.72;
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x, topY);
  context.lineTo(x, topY + 26 * scale);
  context.stroke();

  const shadeW = 46 * scale;
  const shadeH = 20 * scale;
  context.fillStyle = "#cc4c44";
  context.beginPath();
  context.moveTo(x - shadeW * 0.25, topY + 22 * scale);
  context.lineTo(x + shadeW * 0.25, topY + 22 * scale);
  context.quadraticCurveTo(x + shadeW * 0.55, topY + 34 * scale, x + shadeW * 0.5, topY + 22 * scale + shadeH);
  context.lineTo(x - shadeW * 0.5, topY + 22 * scale + shadeH);
  context.quadraticCurveTo(x - shadeW * 0.55, topY + 34 * scale, x - shadeW * 0.25, topY + 22 * scale);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#ffe587";
  context.beginPath();
  context.ellipse(x, topY + 22 * scale + shadeH, shadeW * 0.2, 4 * scale, 0, 0, Math.PI);
  context.fill();
  context.stroke();
  context.restore();
}

function drawFruitCrate(context: CanvasRenderingContext2D, box: CounterBox, compact: boolean) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const cx = (box.left + box.right) * 0.5;
  const frontTop = box.top + h * 0.34;
  const perspectiveInset = Math.max(4, w * 0.08);

  context.save();

  context.fillStyle = "rgba(18, 8, 26, 0.35)";
  roundedRect(context, box.left - 3, box.bottom - 7, w + 8, 12, 5);
  context.fill();

  context.fillStyle = "#5c3428";
  context.strokeStyle = INK;
  context.lineWidth = compact ? 2.4 : 3;
  context.beginPath();
  context.moveTo(box.left + perspectiveInset, box.top);
  context.lineTo(box.right - perspectiveInset, box.top);
  context.lineTo(box.right, frontTop);
  context.lineTo(box.left, frontTop);
  context.closePath();
  context.fill();
  context.stroke();

  const fruitBaseY = frontTop + 2;
  const r = Math.max(6, Math.min(18, w * 0.14));

  if (!compact) {
    const px = box.right - w * 0.25;
    const py = fruitBaseY - r * 0.4;
    context.fillStyle = "#55b85c";
    context.strokeStyle = INK;
    context.lineWidth = 2.4;
    [-0.35, 0, 0.35].forEach((tilt) => {
      context.save();
      context.translate(px, py);
      context.rotate(tilt);
      context.beginPath();
      context.moveTo(-4, 0);
      context.quadraticCurveTo(0, -r * 1.4, 5, -r * 1.55);
      context.quadraticCurveTo(6, -r * 0.6, 4, 0);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    });
    context.fillStyle = "#dfa839";
    context.beginPath();
    context.arc(px, py + 4, r * 0.9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  const fruits: Array<{ fx: number; fy: number; radius: number; fill: string; highlight: string }> = compact
    ? [
        { fx: cx - w * 0.18, fy: fruitBaseY - r * 0.3, radius: r, fill: "#ea8820", highlight: "#ffd072" },
        { fx: cx + w * 0.18, fy: fruitBaseY - r * 0.2, radius: r * 0.92, fill: "#8ad43e", highlight: "#d8ff8b" },
      ]
    : [
        { fx: box.left + w * 0.26, fy: fruitBaseY - r * 0.35, radius: r * 1.05, fill: "#ea8820", highlight: "#ffd072" },
        { fx: box.left + w * 0.48, fy: fruitBaseY - r * 0.45, radius: r * 0.95, fill: "#8ad43e", highlight: "#d8ff8b" },
        { fx: box.left + w * 0.36, fy: fruitBaseY + 3, radius: r * 0.9, fill: "#e0488e", highlight: "#ff92c6" },
        { fx: box.left + w * 0.62, fy: fruitBaseY + 2, radius: r * 0.96, fill: "#f29b2c", highlight: "#ffe08e" },
      ];

  fruits.forEach((f) => {
    context.fillStyle = f.fill;
    context.strokeStyle = INK;
    context.lineWidth = compact ? 2 : 2.6;
    context.beginPath();
    context.arc(f.fx, f.fy, f.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = f.highlight;
    context.beginPath();
    context.arc(f.fx - f.radius * 0.3, f.fy - f.radius * 0.3, f.radius * 0.28, 0, Math.PI * 2);
    context.fill();
  });

  const boxH = box.bottom - frontTop;
  context.fillStyle = "#8a553a";
  context.strokeStyle = INK;
  context.lineWidth = compact ? 2.4 : 3.2;
  roundedRect(context, box.left, frontTop, w, boxH, 4);
  context.fill();
  context.stroke();

  context.strokeStyle = "#4d2a1f";
  context.lineWidth = compact ? 1.5 : 2;
  for (let slat = 1; slat <= 2; slat += 1) {
    const sy = frontTop + (boxH * slat) / 3;
    context.beginPath();
    context.moveTo(box.left + 3, sy);
    context.lineTo(box.right - 3, sy);
    context.stroke();
  }

  context.fillStyle = "#a56d4f";
  context.fillRect(box.left + 3, frontTop + 2, w - 6, Math.max(3, boxH * 0.16));
  if (!compact) {
    context.fillStyle = CREAM;
    roundedRect(context, cx - w * 0.22, frontTop + boxH * 0.42, w * 0.44, Math.max(8, boxH * 0.28), 3);
    context.fill();
    context.strokeStyle = INK;
    context.lineWidth = 1.8;
    context.stroke();
  }

  context.restore();
}

function drawCuttingBoard(context: CanvasRenderingContext2D, box: CounterBox, isNarrow: boolean) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const skew = Math.min(18, w * 0.12);
  const thickness = isNarrow ? 7 : 10;

  context.save();

  context.fillStyle = "rgba(15, 7, 22, 0.42)";
  context.beginPath();
  context.moveTo(box.left + skew + 4, box.top + 6);
  context.lineTo(box.right - skew * 0.5 + 4, box.top + 6);
  context.lineTo(box.right + 4, box.bottom - thickness + 8);
  context.lineTo(box.left + 4, box.bottom - thickness + 8);
  context.closePath();
  context.fill();

  context.fillStyle = "#5c3328";
  context.strokeStyle = INK;
  context.lineWidth = 3.2;
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(box.left, box.bottom - thickness);
  context.lineTo(box.right, box.bottom - thickness);
  context.lineTo(box.right - 2, box.bottom);
  context.lineTo(box.left + 2, box.bottom);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#915d41";
  context.beginPath();
  context.moveTo(box.left + skew, box.top);
  context.lineTo(box.right - skew * 0.5, box.top);
  context.lineTo(box.right, box.bottom - thickness);
  context.lineTo(box.left, box.bottom - thickness);
  context.closePath();
  context.fill();
  context.stroke();

  context.save();
  context.clip();
  context.fillStyle = "rgba(243, 223, 189, 0.12)";
  context.fillRect(box.left + skew * 0.5, box.top, w, h * 0.24);
  context.strokeStyle = "rgba(50, 20, 50, 0.22)";
  context.lineWidth = 2;
  for (let i = 1; i <= 3; i += 1) {
    const sy = box.top + ((box.bottom - thickness - box.top) * i) / 4;
    context.beginPath();
    context.moveTo(box.left, sy);
    context.lineTo(box.right, sy);
    context.stroke();
  }

  context.strokeStyle = "rgba(50, 20, 50, 0.34)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(box.left + skew + 8, box.top + 7);
  context.lineTo(box.right - skew * 0.5 - 8, box.top + 7);
  context.lineTo(box.right - 10, box.bottom - thickness - 7);
  context.lineTo(box.left + 10, box.bottom - thickness - 7);
  context.closePath();
  context.stroke();
  context.restore();

  const citrusR = isNarrow ? 10 : 16;
  const cx1 = box.left + w * (isNarrow ? 0.38 : 0.34);
  const cy1 = box.top + (h - thickness) * 0.5;
  context.fillStyle = "#e88825";
  context.strokeStyle = INK;
  context.lineWidth = 2.4;
  context.beginPath();
  context.ellipse(cx1, cy1, citrusR, citrusR * 0.68, -0.15, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#f2cfa0";
  context.beginPath();
  context.ellipse(cx1, cy1, citrusR * 0.78, citrusR * 0.5, -0.15, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f3a333";
  context.beginPath();
  context.ellipse(cx1, cy1, citrusR * 0.62, citrusR * 0.39, -0.15, 0, Math.PI * 2);
  context.fill();

  const cx2 = box.left + w * (isNarrow ? 0.68 : 0.52);
  const cy2 = box.top + (h - thickness) * (isNarrow ? 0.58 : 0.55);
  context.fillStyle = "#89cf3d";
  context.strokeStyle = INK;
  context.lineWidth = 2.4;
  context.beginPath();
  context.ellipse(cx2, cy2, citrusR * 0.85, citrusR * 0.55, 0.22, 0, Math.PI);
  context.closePath();
  context.fill();
  context.stroke();

  if (!isNarrow) {
    const kx = box.right - w * 0.26;
    const ky = box.top + h * 0.36;
    context.save();
    context.translate(kx, ky);
    context.rotate(0.58);
    context.fillStyle = "#bfd2cc";
    context.strokeStyle = INK;
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(-26, -5);
    context.lineTo(14, -4);
    context.quadraticCurveTo(22, 1, 14, 5);
    context.lineTo(-26, 4);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = CORAL;
    roundedRect(context, -50, -5, 25, 10, 4);
    context.fill();
    context.stroke();
    context.restore();
  }

  context.restore();
}

function drawJuicerPress(context: CanvasRenderingContext2D, box: CounterBox, isNarrow: boolean) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const cx = (box.left + box.right) * 0.5;
  const baseH = Math.max(10, h * 0.11);
  const baseY = box.bottom;

  context.save();

  context.fillStyle = "rgba(15, 7, 22, 0.45)";
  context.beginPath();
  context.ellipse(cx + 2, baseY - 2, w * 0.46, baseH * 0.72, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = CORAL;
  context.strokeStyle = INK;
  context.lineWidth = 3.2;
  roundedRect(context, cx - w * 0.4, baseY - baseH, w * 0.8, baseH, 6);
  context.fill();
  context.stroke();

  const colX = cx + w * 0.18;
  const colTopY = box.top + h * 0.22;
  context.fillStyle = "#d44b43";
  context.beginPath();
  context.moveTo(colX - w * 0.1, baseY - baseH + 2);
  context.lineTo(colX + w * 0.12, baseY - baseH + 2);
  context.lineTo(colX + w * 0.12, colTopY + 12);
  context.quadraticCurveTo(colX + w * 0.12, colTopY, cx - w * 0.06, colTopY);
  context.lineTo(cx - w * 0.06, colTopY + h * 0.11);
  context.quadraticCurveTo(colX - w * 0.06, colTopY + h * 0.11, colX - w * 0.1, baseY - baseH + 2);
  context.closePath();
  context.fill();
  context.stroke();

  const pivotX = colX;
  const pivotY = colTopY + 8;
  const handleEndX = Math.min(box.right + (isNarrow ? 2 : 8), colX + w * 0.34);
  const handleEndY = box.top + h * 0.06;
  context.strokeStyle = INK;
  context.lineWidth = isNarrow ? 7 : 9;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(pivotX, pivotY);
  context.lineTo(handleEndX, handleEndY);
  context.stroke();
  context.strokeStyle = "#cbdcd6";
  context.lineWidth = isNarrow ? 3 : 4;
  context.stroke();

  context.fillStyle = GOLD;
  context.strokeStyle = INK;
  context.lineWidth = 2.6;
  context.beginPath();
  context.arc(handleEndX, handleEndY, isNarrow ? 5.5 : 7.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const pressX = cx - w * 0.08;
  const coneY = baseY - baseH - h * 0.34;
  context.fillStyle = "#b9cec8";
  context.strokeStyle = INK;
  context.lineWidth = 2.8;
  context.fillRect(pressX - 4, colTopY + 4, 8, coneY - (colTopY + 4));
  context.strokeRect(pressX - 4, colTopY + 4, 8, coneY - (colTopY + 4));

  context.fillStyle = "#d5e4df";
  context.beginPath();
  context.moveTo(pressX - w * 0.2, coneY);
  context.lineTo(pressX + w * 0.2, coneY);
  context.lineTo(pressX + w * 0.12, coneY + h * 0.14);
  context.lineTo(pressX - w * 0.12, coneY + h * 0.14);
  context.closePath();
  context.fill();
  context.stroke();

  const cupW = w * 0.32;
  const cupH = h * 0.24;
  const cupTop = baseY - baseH - cupH;
  context.fillStyle = "rgba(243, 223, 189, 0.78)";
  context.beginPath();
  context.moveTo(pressX - cupW * 0.5, cupTop);
  context.lineTo(pressX + cupW * 0.5, cupTop);
  context.lineTo(pressX + cupW * 0.38, baseY - baseH);
  context.lineTo(pressX - cupW * 0.38, baseY - baseH);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#ee8d24";
  context.beginPath();
  context.moveTo(pressX - cupW * 0.42, cupTop + cupH * 0.42);
  context.lineTo(pressX + cupW * 0.42, cupTop + cupH * 0.42);
  context.lineTo(pressX + cupW * 0.35, baseY - baseH - 2);
  context.lineTo(pressX - cupW * 0.35, baseY - baseH - 2);
  context.closePath();
  context.fill();

  context.restore();
}

function drawPrepMat(
  context: CanvasRenderingContext2D,
  box: CounterBox,
  station: DrinkStationLayout,
  isNarrow: boolean,
) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const skew = isNarrow ? 6 : 12;

  context.save();
  context.fillStyle = "#17272e";
  context.strokeStyle = INK;
  context.lineWidth = 3.2;
  context.beginPath();
  context.moveTo(box.left + skew, box.top);
  context.lineTo(box.right - skew * 0.5, box.top);
  context.lineTo(box.right, box.bottom);
  context.lineTo(box.left, box.bottom);
  context.closePath();
  context.fill();
  context.stroke();

  context.strokeStyle = "rgba(102, 217, 192, 0.14)";
  context.lineWidth = 2;
  const railCols = isNarrow ? 5 : 8;
  for (let i = 1; i < railCols; i += 1) {
    const t = i / railCols;
    const tx = box.left + skew + t * (w - skew * 1.5);
    const bx = box.left + t * w;
    context.beginPath();
    context.moveTo(tx, box.top + 7);
    context.lineTo(bx, box.bottom - 7);
    context.stroke();
  }

  const padRadiusX = Math.max(24, station.bottomWidth * 0.88);
  const padRadiusY = Math.max(7, h * 0.08);
  context.fillStyle = "#223b42";
  context.strokeStyle = "rgba(243, 223, 189, 0.35)";
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(station.x, station.baseY + 2, padRadiusX, padRadiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.restore();
}

function bakeStaticScene(
  width: number,
  height: number,
  dpr: number,
  station: DrinkStationLayout,
  layout: CounterSceneLayout,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const {
    wallBottom,
    railY,
    backPanelBox,
    leftMenu,
    rightMenu,
    prepMat,
    cuttingBoard,
    juicerPress,
    fruitCrate,
    cupStackRight,
  } = layout;

  // 1. Back wall teal glow
  context.fillStyle = "#10333b";
  context.fillRect(0, 0, width, height);

  const wallGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.32,
    0,
    width * 0.5,
    height * 0.4,
    Math.max(width * 0.62, height * 0.74),
  );
  wallGlow.addColorStop(0, "#397d75");
  wallGlow.addColorStop(0.48, "#245b5b");
  wallGlow.addColorStop(1, "#10333b");
  context.fillStyle = wallGlow;
  context.fillRect(0, 0, width, wallBottom);

  // 2. Cel-shaded diner wall tiles
  context.save();
  const tile = Math.max(50, Math.min(72, width * 0.052));
  const tileOffset = tile * 0.42;
  context.strokeStyle = "rgba(19,52,57,.55)";
  context.lineWidth = 2;
  for (let y = tileOffset; y < wallBottom; y += tile) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let x = 0; x < width; x += tile) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, wallBottom);
    context.stroke();
  }
  context.strokeStyle = "rgba(117,213,194,.2)";
  context.lineWidth = 1.5;
  for (let y = tileOffset + 3; y < wallBottom; y += tile) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let x = 3; x < width; x += tile) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, wallBottom);
    context.stroke();
  }
  context.restore();

  // 3. Back-bar stainless dado / lower backsplash along the rear prep wall
  const dadoHeight = Math.max(40, Math.min(64, height * 0.068));
  const dadoTop = wallBottom - dadoHeight;
  const dadoGrad = context.createLinearGradient(0, dadoTop, 0, wallBottom);
  dadoGrad.addColorStop(0, "#2b565b");
  dadoGrad.addColorStop(0.55, "#1e4248");
  dadoGrad.addColorStop(1, "#143038");
  context.fillStyle = dadoGrad;
  context.fillRect(0, dadoTop, width, dadoHeight);
  context.fillStyle = "rgba(200, 232, 224, 0.14)";
  context.fillRect(0, dadoTop, width, 4);
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, dadoTop);
  context.lineTo(width, dadoTop);
  context.stroke();

  // 4. Recessed back-bar wall panel (strictly below the shelf so it reads as an interior back bar, never an exterior window)
  if (backPanelBox) {
    const px = backPanelBox.left;
    const py = backPanelBox.top;
    const pw = backPanelBox.right - backPanelBox.left;
    const ph = backPanelBox.bottom - backPanelBox.top;
    context.strokeStyle = "rgba(18, 48, 54, 0.55)";
    context.lineWidth = 6;
    roundedRect(context, px, py, pw, ph, 12);
    context.stroke();
    context.strokeStyle = "rgba(243, 223, 189, 0.25)";
    context.lineWidth = 2;
    roundedRect(context, px + 3, py + 3, pw - 6, ph - 6, 9);
    context.stroke();
  }

  // Subtle wing pendant lamps above the upper back-bar shelf on wide viewports
  if (!layout.isNarrow && height >= 560) {
    const lampTop = 76;
    const lampScale = Math.max(0.85, Math.min(1.05, width / 1280));
    drawPendantValanceShade(context, width * 0.21, lampTop, lampScale);
    drawPendantValanceShade(context, width * 0.79, lampTop, lampScale);
  }

  // 5. Back-bar upper shelf with diner checker fascia and wing prep items
  context.fillStyle = INK;
  context.fillRect(0, railY - 7, width, 28);
  context.fillStyle = CREAM;
  context.fillRect(0, railY - 3, width, 20);
  const checkerWidth = Math.max(25, Math.min(42, width * 0.031));
  for (let x = -checkerWidth; x < width + checkerWidth; x += checkerWidth) {
    const column = Math.floor(x / checkerWidth);
    context.fillStyle = column % 2 === 0 ? CORAL : "#fff0cb";
    context.fillRect(x, railY - 1, checkerWidth, 15);
  }
  context.fillStyle = "rgba(255,255,255,.72)";
  context.fillRect(0, railY - 4, width, 3);
  context.fillStyle = MINT;
  context.globalAlpha = 0.42;
  context.fillRect(0, railY + 14, width, 2);
  context.globalAlpha = 1;

  drawBackBarShelfProps(context, layout);

  // 6. Menu boards + starburst sconces on back bar wall
  drawMenuBoardFrame(context, leftMenu);
  drawMenuBoardFrame(context, rightMenu);

  const sparkRadius = Math.max(14, Math.min(23, width * 0.019));
  drawDinerSpark(context, leftMenu.x + leftMenu.width * 0.5, leftMenu.y - 38, sparkRadius, GOLD, 0.42);
  drawDinerSpark(context, rightMenu.x + rightMenu.width * 0.5, rightMenu.y - 38, sparkRadius, CORAL, 0.4);

  // 7. Prep counter back curb (chrome & cream transition where counter meets backsplash)
  context.fillStyle = INK;
  context.fillRect(0, wallBottom - 8, width, 30);
  context.fillStyle = "#b7cbc5";
  context.fillRect(0, wallBottom - 4, width, 9);
  context.fillStyle = "rgba(255,255,255,.68)";
  context.fillRect(0, wallBottom - 4, width, 2.5);
  context.fillStyle = CREAM;
  context.fillRect(0, wallBottom + 5, width, 7);
  context.fillStyle = CORAL;
  context.fillRect(0, wallBottom + 12, width, 7);
  context.fillStyle = "rgba(50,20,50,.24)";
  for (let x = -34; x < width + 34; x += 76) context.fillRect(x, wallBottom + 12, 38, 7);

  // 8. Foreground prep counter surface (looking slightly down at the worktop)
  const counterTop = wallBottom + 19;
  const counterGradient = context.createLinearGradient(0, counterTop, 0, height);
  counterGradient.addColorStop(0, "#562b42");
  counterGradient.addColorStop(0.28, "#381e36");
  counterGradient.addColorStop(1, "#181528");
  context.fillStyle = counterGradient;
  context.fillRect(0, counterTop, width, height - counterTop);

  // Perspective tabletop seams radiating from center vanishing point above the counter
  const vanishX = width * 0.5;
  const vanishY = height * 0.24;
  const seamFractions = [0.16, 0.34, 0.5, 0.66, 0.84];
  context.save();
  context.beginPath();
  context.rect(0, counterTop, width, height - counterTop);
  context.clip();
  seamFractions.forEach((fraction) => {
    const topX = width * fraction;
    const slope = (topX - vanishX) / Math.max(1, counterTop - vanishY);
    const botX = topX + slope * (height - counterTop);
    context.strokeStyle = "rgba(18, 9, 26, 0.54)";
    context.lineWidth = 3.5;
    context.beginPath();
    context.moveTo(topX, counterTop);
    context.lineTo(botX, height);
    context.stroke();

    context.strokeStyle = "rgba(243, 223, 189, 0.09)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(topX + 4, counterTop);
    context.lineTo(botX + 4, height);
    context.stroke();
  });

  context.fillStyle = "rgba(255, 240, 210, 0.05)";
  context.fillRect(0, counterTop, width, 4);
  context.restore();

  // 9. Prep counter props: bar-prep mat (left station), cutting board, chilled fruit crate, lever juicer, cup stack
  drawPrepMat(context, prepMat, station, layout.isNarrow);
  if (fruitCrate) drawFruitCrate(context, fruitCrate, layout.isCompactPhone);
  if (cuttingBoard) drawCuttingBoard(context, cuttingBoard, layout.isNarrow);
  if (juicerPress) drawJuicerPress(context, juicerPress, layout.isNarrow);
  if (cupStackRight) {
    drawCupStack(context, cupStackRight.x, cupStackRight.baseY, 28, 34, 4, false, MINT);
  }

  // 10. Unified falling-fruit legibility scrim over the prep counter band
  const scrimTop = wallBottom - 6;
  const barScrim = context.createLinearGradient(0, scrimTop, 0, height);
  barScrim.addColorStop(0, "rgba(16, 8, 22, 0)");
  barScrim.addColorStop(0.18, "rgba(14, 8, 18, 0.18)");
  barScrim.addColorStop(1, "rgba(10, 6, 16, 0.34)");
  context.fillStyle = barScrim;
  context.fillRect(0, scrimTop, width, height - scrimTop);

  // 11. Deterministic print freckles + vignette + vertical risograph grain
  context.save();
  context.fillStyle = "#f8dfb8";
  for (let index = 0; index < 92; index += 1) {
    const x = (index * 127 + 37) % Math.max(1, Math.floor(width));
    const y = (index * 83 + 19) % Math.max(1, Math.floor(wallBottom));
    const edge = Math.min(x, width - x) / Math.max(1, width * 0.5);
    context.globalAlpha = 0.025 + (1 - edge) * 0.04;
    context.beginPath();
    context.arc(x, y, index % 7 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    width * 0.78,
  );
  vignette.addColorStop(0, "rgba(9,23,29,0)");
  vignette.addColorStop(0.66, "rgba(8,10,20,.05)");
  vignette.addColorStop(1, "rgba(8,10,20,.52)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255,244,218,.025)";
  for (let x = 0; x < width; x += 41) context.fillRect(x, 0, 1, height);

  return canvas;
}

export function drawBehindCounterBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  freshPressed: readonly string[] = FRESH_PRESSED_MENU,
  houseMixes: readonly string[] = HOUSE_MIXES_MENU,
) {
  const station = getDrinkStationLayout(width, height);
  const staticKey = `${width}x${height}@${dpr}|${Math.round(station.x)}x${Math.round(station.baseY)}x${station.topWidth}`;

  if (!staticCache || staticCache.key !== staticKey) {
    const layout = getCounterSceneLayout(width, height, station);
    staticCache = {
      key: staticKey,
      canvas: bakeStaticScene(width, height, dpr, station, layout),
      layout,
    };
    composedCache = null;
  }

  const menuKey = `${staticKey}|${freshPressed.join("\n")}||${houseMixes.join("\n")}`;
  if (!composedCache || composedCache.key !== menuKey) {
    const composed = document.createElement("canvas");
    composed.width = staticCache.canvas.width;
    composed.height = staticCache.canvas.height;
    const composedCtx = composed.getContext("2d");
    if (composedCtx) {
      composedCtx.drawImage(staticCache.canvas, 0, 0);
      composedCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMenuBoardLines(composedCtx, staticCache.layout.leftMenu, freshPressed);
      drawMenuBoardLines(composedCtx, staticCache.layout.rightMenu, houseMixes);
      composedCache = { key: menuKey, canvas: composed };
    }
  }

  if (composedCache) {
    context.drawImage(composedCache.canvas, 0, 0, width, height);
  } else {
    context.drawImage(staticCache.canvas, 0, 0, width, height);
    drawMenuBoardLines(context, staticCache.layout.leftMenu, freshPressed);
    drawMenuBoardLines(context, staticCache.layout.rightMenu, houseMixes);
  }
}

export function invalidateBackdropCache() {
  staticCache = null;
  composedCache = null;
}
