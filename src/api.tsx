import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { IMagick } from "./types";
import { perspectivePoints } from "./contants";
import { toCoord } from "./utils";
import { MagickFile } from "wasm-imagemagick";

const ImageMagick: FC<{ magick: IMagick }> = ({ magick }) => {
  const [loading, setLoading] = useState(false);
  const [dimensions, setDimensions] = useState([0, 0]);

  const { buildInputFile, execute, asInputFile, loadImageElement } = useMemo(
    () => magick!,
    [magick]
  );

  const logInfo = useCallback(async () => {
    const { stdout, stderr } = await execute({
      commands: ["convert -version"],
    });
    console.log(stdout, stderr, "stdout stderr");
  }, [execute]);

  const getTemplateDimension = useCallback(async () => {
    const { stdout } = await execute({
      inputFiles: [await buildInputFile("/template.jpg", "template.jpg")],
      commands: ["identify template.jpg"],
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_dimension, x, y] = /(\d+)x(\d+)/gi.exec(stdout[0]) as Array<string>;
    const _dimensions = [parseInt(x), parseInt(y)];
    setDimensions(_dimensions);
    console.log(_dimensions, "dimensions");
    return _dimensions;
  }, [buildInputFile, execute]);

  const resizeArtwork = useCallback(async () => {
    const RESIZE = "502x855";
    const PERSPECTIVE = perspectivePoints;
    const ROTATE = "0";
    const EXTENT = `${dimensions[0]}x${dimensions[1]}${toCoord("0")}${toCoord(
      "0"
    )}`;
    const { outputFiles, exitCode, errors, stderr, stdout } = await execute({
      inputFiles: [await buildInputFile("/artwork.png", "artwork.png")],
      commands: [
        `convert artwork.png -resize ${RESIZE} -rotate ${ROTATE} -extent ${EXTENT} artwork_resized.jpg`,
        // `convert -size 1000x1000 xc:black black.png \\( artwork_resized.jpg -background none -virtual-pixel background +distort Perspective "${PERSPECTIVE}" \\) -compose over -flatten artwork_resized.jpg`,
      ],
    }); //convert artwork_resized.jpg -background none -virtual-pixel background +distort Perspective ${PERSPECTIVE} artwork_resized.jpg
    if (!exitCode) {
      console.log(outputFiles[0], "resizeArtwork");
      const outputImage = document.getElementById(
        "outputImage"
      ) as HTMLImageElement;
      // convert buffer to blob
      const blob = new Blob([outputFiles[0].buffer!]);
      const url = URL.createObjectURL(blob);
      // make a download link
      const a = document.createElement("a");
      a.href = url;
      a.download = "output.jpg";
      a.click();
      outputImage.src = url;
      return outputFiles[0];
    } else {
      console.log(
        errors,
        "errors: resizeArtwork",
        "stderr",
        stderr,
        "stdout",
        stdout
      );
    }
  }, [buildInputFile, dimensions, execute]);

  const applyPerspective = useCallback(
    async (resizedArtwork: MagickFile) => {
      const { outputFiles, exitCode, errors, stdout } = await execute({
        inputFiles: [await asInputFile(resizedArtwork, "artwork_resized.jpg")],
        commands: [
          "identify artwork_resized.jpg",
          //   `convert -size 1000x1000 xc:black black.png`,
          //   `convert black.png -compose over -flatten artwork_resized.jpg`,
        ],
      });
      console.log(stdout, "stdout");
      if (!exitCode) {
        return outputFiles[0];
      } else {
        console.log(errors, "errors: applyPerspective");
      }
    },
    [asInputFile, execute]
  );

  const generateNormalizedMap = useCallback(async () => {
    const { outputFiles, exitCode, errors } = await execute({
      inputFiles: [
        await buildInputFile("/template.jpg", "template.jpg"),
        await buildInputFile("/mask.jpg", "mask.jpg"),
      ],
      commands: [
        `convert template.jpg mask.jpg -alpha off -colorspace gray -compose CopyOpacity -composite normalized_map.mpc`,
      ],
    });
    if (!exitCode) {
      console.log(outputFiles[0], "generateNormalizedMap");
      return outputFiles[0];
    } else {
      console.log(errors, "errors: generateNormalizedMap");
    }
  }, [buildInputFile, execute]);

  const generateAdjustmentMap = useCallback(async () => {
    const { outputFiles, exitCode, errors } = await execute({
      inputFiles: [
        await buildInputFile("/template.jpg", "template.jpg"),
        await buildInputFile("/mask.jpg", "mask.jpg"),
      ],
      commands: [
        `convert template.jpg \\( -clone 0 -fill #f1f1f1 -colorize 100 \\) mask.jpg -compose DivideSrc -composite adjustment_map.jpg`,
      ],
    });
    if (!exitCode) {
      console.log(outputFiles[0], "generateAdjustmentMap");
      return outputFiles[0];
    } else {
      console.log(errors, "errors: generateAdjustmentMap");
    }
  }, [buildInputFile, execute]);

  const generateDisplacementMap = useCallback(
    async (normalizedMap: MagickFile) => {
      const MPC_DISPLACEMENT_MAP_PATH = `${
        Math.random().toString(32).split(".")[1]
      }.displacement_map.mpc`;
      const { outputFiles, exitCode, errors } = await execute({
        inputFiles: [await asInputFile(normalizedMap, "normalized_map.mpc")],
        commands: [
          `convert normalized_map.mpc -evaluate subtract 30% -background grey50 -alpha remove -alpha off "${MPC_DISPLACEMENT_MAP_PATH}"`,
          `convert "${MPC_DISPLACEMENT_MAP_PATH}" -blur 0x10 displacement_map.png`,
        ],
      });
      if (!exitCode) {
        console.log(outputFiles[0], "generateDisplacementMap");
        return outputFiles[0];
      } else {
        console.log(errors, "errors: generateDisplacementMap");
      }
    },
    [asInputFile, execute]
  );

  const generateLightingMap = useCallback(
    async (normalizedMap: MagickFile) => {
      const MPC_LIGHTING_MAP_PATH = `${
        Math.random().toString(32).split(".")[1]
      }.lighting_map.mpc`;

      const { outputFiles, exitCode, errors } = await execute({
        inputFiles: [await asInputFile(normalizedMap, "normalized_map.mpc")],
        commands: [
          `convert normalized_map.mpc -evaluate subtract 50% -background grey50 -alpha remove -alpha off "${MPC_LIGHTING_MAP_PATH}"`,
          `convert "${MPC_LIGHTING_MAP_PATH}" \\( -clone 0 -fill grey50 -colorize 100 \\) -compose lighten -composite lighting_map.png`,
        ],
      });
      if (!exitCode) {
        console.log(outputFiles[0], "generateLightingMap");
        return outputFiles[0];
      } else {
        console.log(errors, "errors: generateLightingMap");
      }
    },
    [asInputFile, execute]
  );

  const generateMpcArtwork = useCallback(
    async (
      resizedArtwork: MagickFile,
      displacementMap: MagickFile,
      lightingMap: MagickFile,
      adjustmentMap: MagickFile
    ) => {
      const { outputFiles, exitCode, errors } = await execute({
        inputFiles: [
          await asInputFile(resizedArtwork, "artwork_resized.jpg.jpg"),
          await asInputFile(displacementMap, "displacement_map.png"),
          await asInputFile(lightingMap, "lighting_map.png"),
          await asInputFile(adjustmentMap, "adjustment_map.jpg"),
        ],
        commands: [
          "convert artwork_resized.jpg -bordercolor transparent -border 1 artwork.mpc",
          "convert artwork.mpc -background transparent -alpha remove artwork.mpc",
          "convert artwork.mpc displacement_map.png -compose displace -set option:compose:args 20x20 -composite artwork.mpc",
          "convert artwork.mpc \\( -clone 0 lighting_map.png -compose hardlight -composite \\) +swap -compose CopyOpacity -composite artwork.mpc",
          "convert artwork.mpc \\( -clone 0 adjustment_map.jpg -compose multiply -composite \\) +swap -compose CopyOpacity -composite artwork.mpc",
        ],
      });
      if (!exitCode) {
        console.log(outputFiles[0], "generateMpcArtwork");
        return outputFiles[0];
      } else {
        console.log(errors, "errors: generateMpcArtwork");
      }
    },
    [asInputFile, execute]
  );

  const generateFinalImage = useCallback(
    async (mpcArtwork: MagickFile) => {
      // `convert ${TEMPLATE_PATH} ${MPC_ARTWORK_PATH} ${MASK_PATH} -compose over -composite ${MOCKUP_PATH}`
      const { outputFiles, exitCode } = await execute({
        inputFiles: [
          await buildInputFile("/template.jpg", "template.jpg"),
          await asInputFile(mpcArtwork, "artwork.mpc"),
        ],
        commands: [
          "convert template.jpg artwork.mpc mask.jpg -compose over -composite mockup.jpg",
        ],
      });
      if (!exitCode) {
        console.log(outputFiles[0], "generateFinalImage");
        return outputFiles[0];
      } else {
        console.log("errors: generateFinalImage");
      }
    },
    [asInputFile, buildInputFile, execute]
  );
  const processImage = useCallback(async () => {
    try {
      await logInfo();
      await getTemplateDimension();
      const resizedArtwork = await resizeArtwork();
      if (resizedArtwork) {
        const file = await applyPerspective(resizedArtwork);
        console.log(file, "file");
      }
      return;
      const normalizedMap = await generateNormalizedMap();
      const adjustmentMap = await generateAdjustmentMap();
      if (normalizedMap && adjustmentMap) {
        const displacementMap = await generateDisplacementMap(normalizedMap);
        const lightingMap = await generateLightingMap(normalizedMap);
        if (displacementMap && lightingMap && resizedArtwork) {
          const mpcArtwork = await generateMpcArtwork(
            resizedArtwork,
            displacementMap,
            lightingMap,
            adjustmentMap
          );
          if (mpcArtwork) {
            const finalImage = await generateFinalImage(mpcArtwork);
            if (finalImage) {
              await loadImageElement(
                finalImage,
                document.getElementById("outputImage") as HTMLImageElement
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [
    logInfo,
    getTemplateDimension,
    resizeArtwork,
    generateNormalizedMap,
    generateAdjustmentMap,
    applyPerspective,
    generateDisplacementMap,
    generateLightingMap,
    generateMpcArtwork,
    generateFinalImage,
    loadImageElement,
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      <button disabled={loading} onClick={processImage}>
        {loading ? "Loading" : "Process"}
      </button>
      <img style={{ minWidth: "800px", minHeight: "800px" }} id="outputImage" />
    </div>
  );
};

const Api = () => {
  const [loading, setLoading] = useState(true);
  const [magick, setMagick] = useState<IMagick | null>(null);

  useEffect(() => {
    const loadMagick = async () => {
      if (!window.magick) {
        try {
          const Magick = await import(
            "https://knicknic.github.io/wasm-imagemagick/magickApi.js"
          );
          window.magick = Magick;
          setMagick(Magick);
          setLoading(false);
        } catch (error) {
          console.error("Failed to load Magick API", error);
        }
      } else {
        setMagick(window.magick);
        setLoading(false);
      }
    };

    loadMagick();
  }, []);

  if (loading || !magick) return <p>Loading.....</p>;

  return <ImageMagick magick={magick} />;
};

export default Api;
