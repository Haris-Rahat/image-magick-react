import { useCallback, useEffect, useRef, useState } from "react";

import {
  initializeImageMagick,
  ImageMagick,
  DistortMethod,
  CompositeOperator,
  MagickColors,
  AlphaOption,
  ColorSpace,
  EvaluateOperator,
  Gravity,
  MagickImage,
  VirtualPixelMethod,
  MagickFormat,
} from "@imagemagick/magick-wasm";
import magickWasm from "@imagemagick/magick-wasm/magick.wasm?url";

function Wrapper() {
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileToUrl = useCallback((file: File) => {
    return new Promise<{ fileUrl: string; name: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) {
          reject(new Error("Error"));
          return;
        }
        resolve({ fileUrl: event.target.result.toString(), name: file.name });
      };
      reader.onerror = () => {
        reject(new Error("File reading failed"));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  async function urlToBuffer(url: string): Promise<Uint8Array> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      const files = e.target.files;
      if (files) {
        const file = files[0];
        const { fileUrl = "" } = await fileToUrl(file);
        const image = new Image();
        image.src = fileUrl;
        image.onload = () => {
          const canvas = document.querySelector("canvas");
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.reset();
              ctx.drawImage(image, 0, 0, 500, 500);
            }
          }
        };
      }
    },
    [fileToUrl]
  );

  const getTemplateDimensions = useCallback(async (fileBuffer: Uint8Array) => {
    console.log("GET DIMENSIONS");
    const dimensions = ImageMagick.read(fileBuffer, (image) => {
      return {
        width: image.width,
        height: image.height,
      };
    });
    return dimensions;
  }, []);

  const resizeImage = useCallback(
    (fileBuffer: Uint8Array, dimensions: { width: number; height: number }) => {
      console.log("RESIZE IMAGE");
      let result = new Uint8Array();
      ImageMagick.read(fileBuffer, (image) => {
        // Resize and apply perspective to the main image
        image.resize(502, 855);
        image.rotate(0);
        image.extent(dimensions.width, dimensions.height, Gravity.Northwest);
        result = image.write(MagickFormat.Jpg, (buffer) => buffer);
        image.writeToCanvas(canvasRef.current!);
      });
      return result;
    },
    []
  );

  const applyPerspective = useCallback((resizedImageBuffer: Uint8Array) => {
    console.log("APPLY PERSPECTIVE");
    let result = new Uint8Array();
    ImageMagick.read(resizedImageBuffer, (resizedImage) => {
      const blackImage = MagickImage.create(MagickColors.Black, 1000, 1000);
      resizedImage.backgroundColor = MagickColors.None;
      resizedImage.virtualPixelMethod = VirtualPixelMethod.Background;
      resizedImage.distort(
        DistortMethod.Perspective,
        [0, 0, 231, 44, 502, 0, 767, 44, 502, 855, 767, 955, 0, 855, 231, 955]
      );
      blackImage.composite(resizedImage, CompositeOperator.Over);
      result = blackImage.write(MagickFormat.Jpg, (buffer) => buffer);
      blackImage.writeToCanvas(canvasRef.current!);
    });
    return result;
  }, []);

  const generateNormalizedMap = useCallback(
    (templateBuffer: Uint8Array, maskBuffer: Uint8Array) => {
      console.log("GENERATE NORMALIZED MAP");
      let result = new Uint8Array();
      ImageMagick.read(templateBuffer, (template) => {
        ImageMagick.read(maskBuffer, (mask) => {
          mask.alpha(AlphaOption.Off);
          template.alpha(AlphaOption.Off);
          // Convert to grayscale
          template.colorSpace = ColorSpace.Gray;
          // Composite the mask with CopyOpacity
          template.composite(mask, CompositeOperator.Copy);
          result = template.write(MagickFormat.Mpc, (buffer) => buffer);
          template.writeToCanvas(canvasRef.current!);
        });
      });
      return result;
    },
    []
  );

  const generateAdjustmentMap = useCallback(
    (templateBuffer: Uint8Array, maskBuffer: Uint8Array): Uint8Array => {
      console.log("GENERATE ADJUSTMENT MAP");
      let result = new Uint8Array();

      ImageMagick.read(templateBuffer, (template) => {
        template.clone((clonedTemplate) => {
          clonedTemplate.colorAlpha(MagickColors.DimGray); // Apply the fill color

          ImageMagick.read(maskBuffer, (mask) => {
            clonedTemplate.composite(mask, CompositeOperator.DivideSrc);

            // Write the result buffer while the clonedTemplate is still valid
            result = clonedTemplate.write(MagickFormat.Jpg, (buffer) => buffer);

            // Write the result buffer to the canvas
            clonedTemplate.writeToCanvas(canvasRef.current!);
          });
        });
      });

      return result; // Return the result
    },
    []
  );

  const generateDisplacementMap = useCallback(
    (normalizedMapBuffer: Uint8Array) => {
      console.log("GENERATE DISPLACEMENT MAP", normalizedMapBuffer);
      let result = new Uint8Array();
      // download the normalized map
      const blob = new Blob([normalizedMapBuffer], { type: "image/mpc" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "normalized_map.mpc";
      a.click();
      return;
      ImageMagick.read(normalizedMapBuffer, (normalizedMap) => {
        normalizedMap.evaluate(0, EvaluateOperator.Subtract, 30);
        normalizedMap.backgroundColor = MagickColors.DimGray;
        normalizedMap.alpha(AlphaOption.Remove);
        normalizedMap.alpha(AlphaOption.Off);
        const mpcBuffer = normalizedMap.write(
          MagickFormat.Mpc,
          (buffer) => buffer
        );
        console.log(mpcBuffer, "here mpcbuffer");
        ImageMagick.read(mpcBuffer, (mpc) => {
          console.log("processing mpc buffer");
          mpc.blur(10, 5);
          result = mpc.write(MagickFormat.Png, (buffer) => buffer);
          mpc.writeToCanvas(canvasRef.current!);
        });
      });
      return result;
    },
    []
  );

  const generateLightMap = useCallback((normalizedMapBuffer: Uint8Array) => {
    console.log("GENERATE LIGHT MAP");
    let result = new Uint8Array();
    let mpcBuffer = new Uint8Array();
    //`convert "${normalizedMapPath}" -evaluate subtract 50% -background grey50 -alpha remove -alpha off "${MPC_LIGHTING_MAP_PATH}"`
    ImageMagick.read(normalizedMapBuffer, (normalizedMap) => {
      normalizedMap.evaluate(0, EvaluateOperator.Subtract, 50);
      normalizedMap.backgroundColor = MagickColors.DimGray;
      normalizedMap.alpha(AlphaOption.Remove);
      normalizedMap.alpha(AlphaOption.Off);
      mpcBuffer = normalizedMap.write(MagickFormat.Mpc, (buffer) => buffer);
    });
    ImageMagick.read(mpcBuffer, (mpc) => {
      // Clone the MPC image
      mpc.clone((mpcClone) => {
        // Apply the equivalent of `-fill grey50 -colorize 100`
        mpcClone.opaque(MagickColors.White, MagickColors.DimGray);
        // Composite the original and clone with `Lighten` composition
        mpc.composite(mpcClone, CompositeOperator.Lighten);
        // Write the resulting buffer
        result = mpc.write(MagickFormat.Png, (buffer) => buffer);
        mpc.writeToCanvas(canvasRef.current!);
      });
    });
    return result;
  }, []);

  const processImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvasRef.current.getContext("2d")?.reset();
    const templateBuffer = await urlToBuffer("/template.jpg");
    const maskBuffer = await urlToBuffer("/mask.jpg");
    const artworkbuffer = await urlToBuffer("/artwork.png");
    const { width, height } = await getTemplateDimensions(templateBuffer);
    const resizedImage = resizeImage(artworkbuffer, { width, height });
    const processedImage = applyPerspective(resizedImage);
    const normalizedMapBuffer = generateNormalizedMap(
      templateBuffer,
      maskBuffer
    );
    const adjustmentMapBuffer = generateAdjustmentMap(
      templateBuffer,
      maskBuffer
    );
    const displacementMapBuffer = generateDisplacementMap(normalizedMapBuffer);
    const lightingMapBuffer = generateLightMap(normalizedMapBuffer);
    let artworkMpcBuffer = new Uint8Array();
    ImageMagick.read(processedImage, (artwork) => {
      ImageMagick.read(displacementMapBuffer, (displacementMap) => {
        ImageMagick.read(lightingMapBuffer, (lightingMap) => {
          ImageMagick.read(adjustmentMapBuffer, (adjustmentMap) => {
            // Step 1: Add Transparent Border
            artwork.borderColor = MagickColors.Transparent;
            artwork.border(1);
            artworkMpcBuffer = artwork.write(
              MagickFormat.Mpc,
              (buffer) => buffer
            );
            ImageMagick.read(artworkMpcBuffer, (mpcArtwork) => {
              // Step 2: Remove Alpha and Set Background Transparent
              mpcArtwork.backgroundColor = MagickColors.Transparent;
              mpcArtwork.alpha(AlphaOption.Remove);
              // Step 3: Apply Displacement Map
              mpcArtwork.composite(
                displacementMap,
                CompositeOperator.Displace,
                "20x20"
              );
              // Step 4: Combine Artwork and Lighting Map
              mpcArtwork.composite(lightingMap, CompositeOperator.HardLight); // Apply HardLight
              const lightingClone = mpcArtwork.clone((_artwork) => _artwork); // Clone result
              mpcArtwork.composite(lightingClone, CompositeOperator.CopyAlpha); // Apply CopyAlpha

              // Step 5: Combine Artwork and Adjustment Map
              mpcArtwork.composite(adjustmentMap, CompositeOperator.Multiply); // Apply Multiply
              const adjustmentClone = artwork.clone((adjClone) => adjClone); // Clone result
              mpcArtwork.composite(
                adjustmentClone,
                CompositeOperator.CopyAlpha
              ); // Apply CopyAlpha
              // Write final output to canvas

              ImageMagick.read(templateBuffer, (template) => {
                ImageMagick.read(maskBuffer, (mask) => {
                  template.composite(mpcArtwork, CompositeOperator.Over);
                  template.composite(mask, CompositeOperator.Over);
                  template.writeToCanvas(canvas);
                });
              });
            });
          });
        });
      });
    });
  }, [
    applyPerspective,
    generateAdjustmentMap,
    generateDisplacementMap,
    generateLightMap,
    generateNormalizedMap,
    getTemplateDimensions,
    resizeImage,
  ]);

  useEffect(() => {
    initializeImageMagick(new URL(magickWasm, import.meta.url))
      .then(() => setLoading(false))
      .catch(console.debug);
  }, []);

  if (loading) return <>loading...</>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "1rem",
        width: "100vw",
        height: "100vh",
      }}
    >
      <input
        type="file"
        style={{
          backgroundColor: "white",
          padding: "1rem",
        }}
        onChange={handleImageUpload}
      />
      <canvas
        ref={canvasRef}
        style={{ width: "1000px", height: "1000px", backgroundColor: "white" }}
      />
      <button
        onClick={() => {
          processImage();
        }}
      >
        Convert
      </button>
    </div>
  );
}

export default Wrapper;
