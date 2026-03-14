type RoomOverlayData = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Injects a 100cm coordinate grid into the AI screenshot for spatial reference.
 * Axis labels let the AI read exact (x, y) positions from the image.
 * Inserted BEFORE room content so rooms render on top.
 */
function injectCoordinateGrid(clonedSvg: SVGSVGElement, rooms: RoomOverlayData[]): void {
  const transformGroup = clonedSvg.querySelector("g[transform]");
  if (!transformGroup || rooms.length === 0) return;

  const ns = "http://www.w3.org/2000/svg";
  const GRID = 100; // 100cm = 1 metre

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rooms) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }

  const startX = Math.floor(minX / GRID) * GRID;
  const startY = Math.floor(minY / GRID) * GRID;
  const endX   = Math.ceil(maxX / GRID) * GRID;
  const endY   = Math.ceil(maxY / GRID) * GRID;

  const gridGroup = document.createElementNS(ns, "g");

  // Vertical lines + X-axis labels along the top
  for (let x = startX; x <= endX; x += GRID) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", String(startY));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(endY));
    line.setAttribute("stroke", "#94a3b8");
    line.setAttribute("stroke-width", "0.8");
    line.setAttribute("stroke-dasharray", "5,5");
    line.setAttribute("opacity", "0.35");
    gridGroup.appendChild(line);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(startY - 4));
    label.setAttribute("font-size", "9");
    label.setAttribute("font-family", "monospace");
    label.setAttribute("fill", "#64748b");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("opacity", "0.75");
    label.textContent = String(x);
    gridGroup.appendChild(label);
  }

  // Horizontal lines + Y-axis labels along the left
  for (let y = startY; y <= endY; y += GRID) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(startX));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(endX));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "#94a3b8");
    line.setAttribute("stroke-width", "0.8");
    line.setAttribute("stroke-dasharray", "5,5");
    line.setAttribute("opacity", "0.35");
    gridGroup.appendChild(line);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(startX - 4));
    label.setAttribute("y", String(y));
    label.setAttribute("font-size", "9");
    label.setAttribute("font-family", "monospace");
    label.setAttribute("fill", "#64748b");
    label.setAttribute("text-anchor", "end");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("opacity", "0.75");
    label.textContent = String(y);
    gridGroup.appendChild(label);
  }

  // Prepend so grid renders under rooms
  transformGroup.insertBefore(gridGroup, transformGroup.firstChild);
}

/**
 * Injects high-contrast room ID badges into the cloned SVG's transform group.
 * The AI sees these IDs; the user never sees them (injected into a clone only).
 * Badges are in floor-plan coordinate space (cm) so they scale with the transform.
 */
function injectRoomOverlays(clonedSvg: SVGSVGElement, rooms: RoomOverlayData[]): void {
  const transformGroup = clonedSvg.querySelector("g[transform]");
  if (!transformGroup) return;

  const ns = "http://www.w3.org/2000/svg";

  for (const room of rooms) {
    const shortId = room.id.slice(-8);
    const label = `id:${shortId}`;

    // Scale badge to room size so it's always readable
    const fontSize = Math.min(11, Math.max(7, Math.min(room.width, room.height) / 14));
    const badgeH = fontSize * 1.9;
    const badgeW = Math.min(room.width * 0.5, fontSize * 11);
    const pad = 3;

    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("x", String(room.x + pad));
    bg.setAttribute("y", String(room.y + pad));
    bg.setAttribute("width", String(badgeW));
    bg.setAttribute("height", String(badgeH));
    bg.setAttribute("rx", "2");
    bg.setAttribute("fill", "#0f172a");
    bg.setAttribute("opacity", "0.88");

    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(room.x + pad + 3));
    text.setAttribute("y", String(room.y + pad + badgeH - 3));
    text.setAttribute("font-size", String(fontSize));
    text.setAttribute("font-family", "monospace");
    text.setAttribute("fill", "#4ade80");
    text.setAttribute("font-weight", "bold");
    text.textContent = label;

    transformGroup.appendChild(bg);
    transformGroup.appendChild(text);
  }
}

/**
 * Captures an SVG element as a PNG base64 string.
 * Used to send canvas screenshots to the AI for visual reasoning.
 */
export async function captureSvgAsBase64(svgElement: SVGSVGElement): Promise<string> {
  const svgRect = svgElement.getBoundingClientRect();
  const width = svgRect.width;
  const height = svgRect.height;

  // Clone the SVG to avoid modifying the original
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("width", String(width));
  clonedSvg.setAttribute("height", String(height));

  // Inline computed styles for proper rendering
  const allElements = clonedSvg.querySelectorAll("*");
  const originalElements = svgElement.querySelectorAll("*");
  allElements.forEach((el, i) => {
    const orig = originalElements[i];
    if (orig) {
      const computed = window.getComputedStyle(orig);
      (el as HTMLElement).style.cssText = computed.cssText;
    }
  });

  // Also style the root SVG
  const rootComputed = window.getComputedStyle(svgElement);
  clonedSvg.style.cssText = rootComputed.cssText;
  // Set a solid background for the screenshot
  clonedSvg.style.backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
    : "#f8f9fa";

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2; // 2x for retina quality
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas context"));
        return;
      }
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const base64 = canvas.toDataURL("image/png").split(",")[1];
      resolve(base64);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG for capture"));
    };
    img.src = url;
  });
}

/**
 * Like captureSvgAsBase64 but injects room ID badges for AI visual grounding.
 * The AI can read exact room IDs from the screenshot instead of guessing.
 */
export async function captureFloorPlanSvgAsBase64(
  svgElement: SVGSVGElement,
  rooms: RoomOverlayData[]
): Promise<string> {
  const svgRect = svgElement.getBoundingClientRect();
  const width = svgRect.width;
  const height = svgRect.height;

  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("width", String(width));
  clonedSvg.setAttribute("height", String(height));

  const allElements = clonedSvg.querySelectorAll("*");
  const originalElements = svgElement.querySelectorAll("*");
  allElements.forEach((el, i) => {
    const orig = originalElements[i];
    if (orig) {
      const computed = window.getComputedStyle(orig);
      (el as HTMLElement).style.cssText = computed.cssText;
    }
  });

  const rootComputed = window.getComputedStyle(svgElement);
  clonedSvg.style.cssText = rootComputed.cssText;
  clonedSvg.style.backgroundColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
    : "#f8f9fa";

  injectCoordinateGrid(clonedSvg, rooms);  // grid first (lower z-order)
  injectRoomOverlays(clonedSvg, rooms);    // badges on top

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas context"));
        return;
      }
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const base64 = canvas.toDataURL("image/png").split(",")[1];
      resolve(base64);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG for capture"));
    };
    img.src = url;
  });
}

/**
 * Converts a File to a base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // Strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
