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
