"use client";

import { useEffect, useRef, useState } from "react";

// Cropping a preview to fill its frame is right when the image is roughly the
// frame's shape. A pasted screenshot is often much taller or wider, and a crop
// would cut most of it away (text sliced off at the edges), so those are shown
// whole over a blurred copy of themselves that fills the rest of the frame.
// 1.25 lets a crop trim at most a fifth of the image.
const MAX_CROP_SHAPE_RATIO = 1.25;

type Fit = "cover" | "contain";

function fitFor(img: HTMLImageElement): Fit {
  if (!img.naturalWidth || !img.naturalHeight || !img.clientWidth || !img.clientHeight) return "cover";
  const shape = (img.naturalWidth / img.naturalHeight) / (img.clientWidth / img.clientHeight);
  return shape > MAX_CROP_SHAPE_RATIO || shape < 1 / MAX_CROP_SHAPE_RATIO ? "contain" : "cover";
}

interface CardPreviewImageProps {
  src: string;
  /** YouTube thumbnails are 4:3 with black bars baked in; cropping is what removes them. */
  alwaysCrop?: boolean;
  onError: () => void;
}

// Fills a positioned, overflow-hidden frame (the card's preview link).
export function CardPreviewImage({ src, alwaysCrop = false, onError }: CardPreviewImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [measuredFit, setFit] = useState<Fit>("cover");
  const fit = alwaysCrop ? "cover" : measuredFit;

  // The frame changes shape when a card expands or the grid reflows, so the
  // fit is re-checked on resize as well as on load.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || alwaysCrop) return;
    const update = () => setFit(fitFor(img));
    const observer = new ResizeObserver(update);
    observer.observe(img);
    img.addEventListener("load", update);
    return () => {
      observer.disconnect();
      img.removeEventListener("load", update);
    };
  }, [src, alwaysCrop]);

  return (
    <>
      {fit === "contain" && (
        <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl brightness-75" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt=""
        loading="lazy"
        onError={onError}
        data-preview-fit={fit}
        className={`relative h-full w-full ${fit === "contain" ? "object-contain" : "object-cover object-center"}`}
      />
    </>
  );
}
