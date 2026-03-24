import "./App.css";

import { ProgressIndicator } from "./components/toasts";
import ImageViewer from "./sections/ImageViewer";
import { useSelector } from "react-redux";
import { selectActivePlaneId } from "./state/selectors";
import { Header } from "./sections/Header";
import { ChannelConfigurator } from "./sections/ChannelConfigurator";
import { SliceAdjustor } from "./sections/SliceAdjustor";

function App() {
  const activePlaneId = useSelector(selectActivePlaneId);

  return (
    <div className="min-w-full min-h-screen h-screen flex flex-col items-start justify-center">
      <Header />
      <div className="w-full h-full flex justify-center items-center">
        <div className="flex flex-col w-7/10 h-full">
          <ImageViewer activeId={activePlaneId} />
          <SliceAdjustor />
        </div>
        <div className="h-full w-3/10 border-l border-slate-700 ">
          <ChannelConfigurator planeId={activePlaneId} />
        </div>
      </div>

      <ProgressIndicator />
    </div>
  );
}

export default App;
