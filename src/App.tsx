import { Fragment, useCallback } from "react";
import Api from "./api";
import Wrapper from "./wrapper-im";

function App() {
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

  return (
    <Fragment>
      <Wrapper />
    </Fragment>
  );
}

export default App;
